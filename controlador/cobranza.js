const Venta = require("../modelos/Venta");

const { listarVentasCobranzaService } = require('../services/ventasService');

const listarVentasCobranza = async (req, res) => {
    try {
        // Llamamos al servicio pasándole los query params
        const resultado = await listarVentasCobranzaService(req.query);

        // Devolvemos la respuesta HTTP
        return res.status(200).json({
            ok: true,
            message: 'Ventas encontradas',
            data: resultado.ventas,
            paginacion: resultado.paginacion
        });

    } catch (error) {
        console.error('Error al listar ventas:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al listar ventas: ${error.message}`
        });
    }
};

//obtener venta por id
const detalleVentaCobranza = async (req, res) => {
    try {
        const { id } = req.params;

        const venta = await Venta.findById(id)
            .select('-__v')
            .lean();

        if (!venta) {
            return res.status(404).json({
                ok: false,
                message: 'Venta no encontrada'
            });
        }

        // ==========================================
        // FORMATEAR CUOTAS CON DÍAS DE ATRASO
        // ==========================================
        const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));

        const cuotasFormateadas = venta.cuotas.map(cuota => {
            let diasAtraso = 0;
            let vencida = false;

            if (cuota.estado_cuota !== 'pagada' && new Date(cuota.fechaCobro) < hoy) {
                vencida = true;
                diasAtraso = Math.ceil((hoy - new Date(cuota.fechaCobro)) / (1000 * 60 * 60 * 24));
            }

            return {
                ...cuota,
                diasAtraso,
                vencida,
                // 👉 Saldo pendiente de esta cuota
                saldoPendiente: cuota.montoCuota - (cuota.montoPagado || 0)
            };
        });

        // ==========================================
        // CALCULAR RESUMEN (CORREGIDO)
        // ==========================================

        // 👉 Monto pagado real (suma de montoPagado de cada cuota)
        const montoPagadoReal = venta.cuotas
            .reduce((total, c) => total + (c.montoPagado || 0), 0);

        // 👉 Monto pendiente real (suma de saldos pendientes)
        const montoPendienteReal = venta.cuotas
            .filter(c => c.estado_cuota !== 'pagada')
            .reduce((total, c) => total + (c.montoCuota - (c.montoPagado || 0)), 0);

        const resumen = {
            totalCuotas: venta.cuotas.length,
            cuotasPagadas: venta.cuotas.filter(c => c.estado_cuota === 'pagada').length,
            cuotasPendientes: venta.cuotas.filter(c => c.estado_cuota === 'pendiente').length,
            cuotasPagoParcial: venta.cuotas.filter(c => c.estado_cuota === 'pago parcial').length,
            cuotasNoPagadas: venta.cuotas.filter(c => c.estado_cuota === 'no pagada').length,
            cuotasVencidas: cuotasFormateadas.filter(c => c.vencida).length,
            montoTotal: venta.montoTotal,
            montoPagado: montoPagadoReal,
            montoPendiente: montoPendienteReal
        };

        return res.status(200).json({
            ok: true,
            message: 'Detalle de venta',
            data: {
                ...venta,
                cuotas: cuotasFormateadas,
                resumen
            }
        });

    } catch (error) {
        console.error('Error al obtener detalle de venta:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al obtener detalle de venta: ${error.message}`
        });
    }
};

const cobrarCuotas = async (req, res) => {
    try {
        const { idVenta, cuotas, cobrador, nota } = req.body;

        // ==========================================
        // VALIDACIONES GENERALES
        // ==========================================
        if (!idVenta) {
            return res.status(400).json({ ok: false, message: 'El ID de la venta es obligatorio' });
        }

        if (!cuotas || !Array.isArray(cuotas) || cuotas.length === 0) {
            return res.status(400).json({ ok: false, message: 'Debe especificar al menos una cuota para cobrar' });
        }

        if (!cobrador || !cobrador.nombre) {
            return res.status(400).json({ ok: false, message: 'El nombre del cobrador es obligatorio' });
        }

        // ==========================================
        // VALIDAR CADA CUOTA (incluye lógica MIXTO)
        // ==========================================
        for (const cuota of cuotas) {
            if (!cuota.numeroCuota || !cuota.metodoPago) {
                return res.status(400).json({
                    ok: false,
                    message: `Cada cuota debe tener numeroCuota y metodoPago`
                });
            }

            if (cuota.metodoPago === 'mixto') {
                if (!Array.isArray(cuota.pagos) || cuota.pagos.length < 2) {
                    return res.status(400).json({
                        ok: false,
                        message: `La cuota ${cuota.numeroCuota} es mixta y debe incluir al menos 2 pagos en el array 'pagos'.`
                    });
                }

                for (const p of cuota.pagos) {
                    if (!p.metodo || !p.monto || p.monto <= 0) {
                        return res.status(400).json({
                            ok: false,
                            message: `Cada pago mixto debe tener 'metodo' y 'monto' mayor a 0 (cuota ${cuota.numeroCuota}).`
                        });
                    }
                }
            }
        }

        // ==========================================
        // BUSCAR VENTA
        // ==========================================
        const venta = await Venta.findById(idVenta);

        if (!venta) {
            return res.status(404).json({ ok: false, message: 'Venta no encontrada' });
        }

        if (!venta.estado) {
            return res.status(400).json({ ok: false, message: 'La venta está inactiva' });
        }

        // ==========================================
        // PROCESAR CADA CUOTA
        // ==========================================
        const fechaPago = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
        const cuotasProcesadas = [];
        const cuotasConError = [];

        for (const cuotaData of cuotas) {
            const cuota = venta.cuotas.find(c => c.numeroCuota === Number(cuotaData.numeroCuota));

            if (!cuota) {
                cuotasConError.push({ numeroCuota: cuotaData.numeroCuota, error: 'Cuota no encontrada' });
                continue;
            }

            if (cuota.estado_cuota === 'pagada') {
                cuotasConError.push({ numeroCuota: cuotaData.numeroCuota, error: 'Cuota ya está pagada' });
                continue;
            }

            // ==========================================
            // CALCULAR TOTAL DE LA CUOTA (CON RECARGOS)
            // ==========================================
            const totalRecargos = cuota.recargos?.reduce((sum, r) => sum + r.monto, 0) || 0;
            const totalCuota = cuota.montoCuota + totalRecargos;

            // ==========================================
            // VALIDAR PAGOS MIXTOS CONTRA EL TOTAL
            // ==========================================
            let detallePagos = null;

            if (cuotaData.metodoPago === 'mixto') {
                const sumaPagos = cuotaData.pagos.reduce((sum, p) => sum + Number(p.monto), 0);

                if (Math.abs(sumaPagos - totalCuota) > 1) {
                    cuotasConError.push({
                        numeroCuota: cuotaData.numeroCuota,
                        error: `La suma de pagos mixtos ($${sumaPagos}) no coincide con el total de la cuota ($${totalCuota}).`
                    });
                    continue;
                }

                detallePagos = cuotaData.pagos.map(p => ({
                    metodo: p.metodo,
                    monto: Number(p.monto)
                }));
            }

            // ==========================================
            // MARCAR COMO PAGADA
            // ==========================================
            cuota.estado_cuota = 'pagada';
            cuota.fechaCobrada = fechaPago;
            cuota.metodoPago = cuotaData.metodoPago;
            cuota.montoPagado = totalCuota;
            cuota.cobrador = { nombre: cobrador.nombre };

            // Inicializar notas si no existe
            if (!cuota.notas) cuota.notas = [];

            // ==========================================
            // 👇 NOTA AUTOMÁTICA DE COBRO (SIEMPRE)
            // ==========================================
            let textoCobro = '';

            if (detallePagos) {
                // Mixto: mostrar el desglose
                const desglose = detallePagos
                    .map(p => `${p.metodo}: $${p.monto.toLocaleString('es-AR')}`)
                    .join(' + ');
                textoCobro = `[COBRO] Pago MIXTO - ${desglose} (Total: $${totalCuota.toLocaleString('es-AR')})`;
            } else {
                // Simple: mostrar método y monto
                textoCobro = `[COBRO] Pago en ${cuotaData.metodoPago} - Monto: $${totalCuota.toLocaleString('es-AR')}`;
            }

            // Si había recargos, aclararlo
            if (totalRecargos > 0) {
                textoCobro += ` (incluye $${totalRecargos.toLocaleString('es-AR')} de recargos)`;
            }

            cuota.notas.push({
                texto: textoCobro,
                fecha: fechaPago,
                usuario: { nombre: cobrador.nombre }
            });

            // ==========================================
            // NOTA MANUAL (si el cobrador escribió algo)
            // ==========================================
            const textoNota = cuotaData.nota || nota;
            if (textoNota && textoNota.trim() !== '') {
                cuota.notas.push({
                    texto: `[OBSERVACIÓN] ${textoNota}`,
                    fecha: fechaPago,
                    usuario: { nombre: cobrador.nombre }
                });
            }

            cuotasProcesadas.push({
                numeroCuota: cuota.numeroCuota,
                montoCuota: cuota.montoCuota,
                totalRecargos,
                montoPagado: cuota.montoPagado,
                metodoPago: cuota.metodoPago,
                detallePagos,
                estado: 'pagada'
            });
        }

        // ==========================================
        // RECALCULAR MONTOS
        // ==========================================
        const totalPagadoCuotas = venta.cuotas.reduce((total, c) => total + (c.montoPagado || 0), 0);
        venta.montoPagado = totalPagadoCuotas;

        if (venta.pagos && venta.pagos.length > 0) {
            const pagosIniciales = venta.pagos.reduce((total, p) => total + p.monto, 0);
            venta.montoPagado += pagosIniciales;
        }

        // ==========================================
        // ACTUALIZAR CONDUCTA DE PAGO
        // ==========================================
        const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
        hoy.setHours(0, 0, 0, 0);

        const cuotasNoPagadas = venta.cuotas.filter(c => c.estado_cuota === 'no pagada').length;
        const todasPagadas = venta.cuotas.every(c => c.estado_cuota === 'pagada');

        if (todasPagadas) venta.conducta_pago = 'cancelado';
        else if (cuotasNoPagadas >= 4) venta.conducta_pago = 'caducado';
        else if (cuotasNoPagadas >= 2) venta.conducta_pago = 'cobro judicial';
        else if (cuotasNoPagadas >= 1) venta.conducta_pago = 'atrasado';
        else venta.conducta_pago = 'al dia';

        const cuotasVencidasNoPagadas = venta.cuotas.filter(c => {
            if (c.estado_cuota === 'pagada') return false;
            return new Date(c.fechaCobro) < hoy;
        }).length;

        // ==========================================
        // GUARDAR
        // ==========================================
        await venta.save();

        const montoPendienteReal = venta.cuotas
            .filter(c => c.estado_cuota !== 'pagada')
            .reduce((total, c) => {
                const recargosPendientes = c.recargos?.reduce((sum, r) => sum + r.monto, 0) || 0;
                return total + (c.montoCuota + recargosPendientes - (c.montoPagado || 0));
            }, 0);

        return res.status(200).json({
            ok: true,
            message: `Se procesaron ${cuotasProcesadas.length} cuotas`,
            data: {
                cuotasProcesadas,
                cuotasConError,
                resumen: {
                    montoTotal: venta.montoTotal,
                    montoPagado: venta.montoPagado,
                    montoPendiente: montoPendienteReal,
                    conducta_pago: venta.conducta_pago,
                    totalCuotas: venta.cuotas.length,
                    cuotasPagadas: venta.cuotas.filter(c => c.estado_cuota === 'pagada').length,
                    cuotasVencidasNoPagadas,
                    totalRecargosCobrados: venta.cuotas
                        .filter(c => c.estado_cuota === 'pagada')
                        .reduce((total, c) => {
                            const recargos = c.recargos?.reduce((sum, r) => sum + r.monto, 0) || 0;
                            return total + recargos;
                        }, 0)
                }
            }
        });

    } catch (error) {
        console.error('Error al cobrar cuotas:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al cobrar cuotas: ${error.message}`
        });
    }
};


////PARA MODIFICACION DE CUOTAS

const editarFechaCuota = async (req, res) => {
    try {
        const { idVenta, numeroCuota } = req.params;
        const { nuevaFecha, usuario, motivo } = req.body;

        // ==========================================
        // VALIDACIONES
        // ==========================================
        if (!nuevaFecha) {
            return res.status(400).json({
                ok: false,
                message: 'La nueva fecha es obligatoria'
            });
        }

        if (!usuario || !usuario.nombre) {
            return res.status(400).json({
                ok: false,
                message: 'El nombre del usuario es obligatorio'
            });
        }

        // ==========================================
        // BUSCAR VENTA Y CUOTA
        // ==========================================
        const venta = await Venta.findById(idVenta);

        if (!venta) {
            return res.status(404).json({
                ok: false,
                message: 'Venta no encontrada'
            });
        }

        const cuota = venta.cuotas.find(c => c.numeroCuota === Number(numeroCuota));

        if (!cuota) {
            return res.status(404).json({
                ok: false,
                message: `Cuota número ${numeroCuota} no encontrada`
            });
        }

        if (cuota.estado_cuota === 'pagada') {
            return res.status(400).json({
                ok: false,
                message: 'No se puede editar una cuota ya pagada'
            });
        }

        // ==========================================
        // GUARDAR FECHA ANTERIOR PARA LA NOTA
        // ==========================================
        const fechaAnterior = cuota.fechaCobro;
        const fechaArgentina = new Date(nuevaFecha + 'T00:00:00-03:00');

        // ==========================================
        // ACTUALIZAR FECHA
        // ==========================================
        cuota.fechaCobro = fechaArgentina;

        // ==========================================
        // AGREGAR NOTA DE HISTORIAL
        // ==========================================
        const fechaAnteriorFormateada = new Date(fechaAnterior).toLocaleDateString('es-AR');
        const fechaNuevaFormateada = fechaArgentina.toLocaleDateString('es-AR');

        cuota.notas.push({
            texto: `[EDITAR FECHA] Cambio: ${fechaAnteriorFormateada} → ${fechaNuevaFormateada}. Motivo: ${motivo || 'Sin especificar'}`,
            fecha: new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })),
            usuario: {
                nombre: usuario.nombre
            }
        });

        await venta.save();

        return res.status(200).json({
            ok: true,
            message: 'Fecha de cuota actualizada exitosamente',
            data: {
                numeroCuota: cuota.numeroCuota,
                fechaAnterior: fechaAnteriorFormateada,
                fechaNueva: fechaNuevaFormateada,
                estado: cuota.estado_cuota
            }
        });

    } catch (error) {
        console.error('Error al editar fecha de cuota:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al editar fecha de cuota: ${error.message}`
        });
    }
};

const editarMontoCuota = async (req, res) => {
    try {
        const { idVenta, numeroCuota } = req.params;
        const { nuevoMonto, usuario, motivo } = req.body;

        // ==========================================
        // VALIDACIONES
        // ==========================================
        if (!nuevoMonto || nuevoMonto <= 0) {
            return res.status(400).json({
                ok: false,
                message: 'El nuevo monto debe ser mayor a 0'
            });
        }

        if (!usuario || !usuario.nombre) {
            return res.status(400).json({
                ok: false,
                message: 'El nombre del usuario es obligatorio'
            });
        }

        // ==========================================
        // BUSCAR VENTA Y CUOTA
        // ==========================================
        const venta = await Venta.findById(idVenta);

        if (!venta) {
            return res.status(404).json({
                ok: false,
                message: 'Venta no encontrada'
            });
        }

        const cuota = venta.cuotas.find(c => c.numeroCuota === Number(numeroCuota));

        if (!cuota) {
            return res.status(404).json({
                ok: false,
                message: `Cuota número ${numeroCuota} no encontrada`
            });
        }

        if (cuota.estado_cuota === 'pagada') {
            return res.status(400).json({
                ok: false,
                message: 'No se puede editar una cuota ya pagada'
            });
        }

        // ==========================================
        // GUARDAR MONTO ANTERIOR
        // ==========================================
        const montoAnterior = cuota.montoCuota;
        const diferencia = nuevoMonto - montoAnterior;

        // ==========================================
        // ACTUALIZAR MONTO
        // ==========================================
        cuota.montoCuota = nuevoMonto;

        // ==========================================
        // ACTUALIZAR MONTO TOTAL DE LA VENTA
        // ==========================================
        venta.montoTotal = venta.montoTotal + diferencia;

        // ==========================================
        // AGREGAR NOTA DE HISTORIAL
        // ==========================================
        const fechaArgentina = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));

        cuota.notas.push({
            texto: `[EDITAR MONTO] Cambio: $${montoAnterior.toLocaleString('es-AR')} → $${nuevoMonto.toLocaleString('es-AR')} (Diferencia: $${diferencia.toLocaleString('es-AR')}). Motivo: ${motivo || 'Sin especificar'}`,
            fecha: fechaArgentina,
            usuario: {
                nombre: usuario.nombre
            }
        });

        await venta.save();

        return res.status(200).json({
            ok: true,
            message: 'Monto de cuota actualizado exitosamente',
            data: {
                numeroCuota: cuota.numeroCuota,
                montoAnterior,
                montoNuevo: nuevoMonto,
                diferencia,
                nuevoMontoTotalVenta: venta.montoTotal
            }
        });

    } catch (error) {
        console.error('Error al editar monto de cuota:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al editar monto de cuota: ${error.message}`
        });
    }
};

// ==========================================
// ✏️ EDITAR RECARGO
// ==========================================
const editarRecargo = async (req, res) => {
    try {
        const { idVenta, numeroCuota, idRecargo } = req.params;
        const { monto, motivo, usuario } = req.body;

        // ==========================================
        // VALIDACIONES
        // ==========================================
        if (!idVenta || !numeroCuota || !idRecargo) {
            return res.status(400).json({
                ok: false,
                message: 'Faltan parámetros (idVenta, numeroCuota, idRecargo)'
            });
        }

        if (monto === undefined && motivo === undefined) {
            return res.status(400).json({
                ok: false,
                message: 'Debe enviar al menos un campo a modificar (monto o motivo)'
            });
        }

        if (monto !== undefined && (isNaN(monto) || monto < 0)) {
            return res.status(400).json({
                ok: false,
                message: 'El monto debe ser un número mayor o igual a 0'
            });
        }

        // ==========================================
        // BUSCAR VENTA Y CUOTA
        // ==========================================
        const venta = await Venta.findById(idVenta);

        if (!venta) {
            return res.status(404).json({
                ok: false,
                message: 'Venta no encontrada'
            });
        }

        const cuota = venta.cuotas.find(c => c.numeroCuota === Number(numeroCuota));

        if (!cuota) {
            return res.status(404).json({
                ok: false,
                message: `Cuota ${numeroCuota} no encontrada`
            });
        }

        // ==========================================
        // BUSCAR RECARGO
        // ==========================================
        const recargo = cuota.recargos.id(idRecargo);

        if (!recargo) {
            return res.status(404).json({
                ok: false,
                message: 'Recargo no encontrado'
            });
        }

        // ==========================================
        // GUARDAR VALORES ANTERIORES
        // ==========================================
        const montoAnterior = recargo.monto;
        const motivoAnterior = recargo.motivo;

        const cambios = [];

        // ==========================================
        // ACTUALIZAR CAMPOS (solo los que vienen)
        // ==========================================
        if (monto !== undefined) {
            recargo.monto = monto;
            cambios.push(`monto: $${montoAnterior} → $${monto}`);
        }

        if (motivo !== undefined && motivo.trim() !== '') {
            recargo.motivo = motivo.trim();
            cambios.push(`motivo: "${motivoAnterior}" → "${motivo.trim()}"`);
        }

        // ==========================================
        // FECHA Y USUARIO DE MODIFICACIÓN
        // ==========================================
        const fechaArgentina = new Date(new Date().toLocaleString('en-US', {
            timeZone: 'America/Argentina/Buenos_Aires'
        }));

        const nombreUsuario = usuario?.nombre || req.usuario?.nombre || 'Sistema';

        // ==========================================
        // AGREGAR NOTA DE TRAZABILIDAD EN LA CUOTA
        // ==========================================
        cuota.notas.push({
            texto: `[RECARGO EDITADO] Recargo modificado por ${nombreUsuario}. Cambios: ${cambios.join(' | ')}.`,
            fecha: fechaArgentina,
            usuario: {
                nombre: nombreUsuario
            }
        });

        // ==========================================
        // GUARDAR
        // ==========================================
        await venta.save();

        return res.status(200).json({
            ok: true,
            message: 'Recargo editado exitosamente',
            data: {
                ventaId: venta._id,
                numeroCuota: cuota.numeroCuota,
                recargo: {
                    _id: recargo._id,
                    monto: recargo.monto,
                    motivo: recargo.motivo,
                    fecha: recargo.fecha,
                    diasAtraso: recargo.diasAtraso,
                    porcentajeAplicado: recargo.porcentajeAplicado,
                    usuario: recargo.usuario
                },
                montoAnterior,
                motivoAnterior,
                cambios
            }
        });

    } catch (error) {
        console.error('Error al editar recargo:', error);

        if (error.name === 'CastError') {
            return res.status(400).json({
                ok: false,
                message: 'ID de venta o recargo inválido'
            });
        }

        return res.status(500).json({
            ok: false,
            message: `Error al editar recargo: ${error.message}`
        });
    }
};

// ==========================================
// 🗑️ ELIMINAR RECARGO
// ==========================================
const eliminarRecargo = async (req, res) => {
    try {
        const { idVenta, numeroCuota, idRecargo } = req.params;
        const { motivo, usuario } = req.body;

        // ==========================================
        // VALIDACIONES
        // ==========================================
        if (!idVenta || !numeroCuota || !idRecargo) {
            return res.status(400).json({
                ok: false,
                message: 'Faltan parámetros (idVenta, numeroCuota, idRecargo)'
            });
        }

        if (!motivo || motivo.trim() === '') {
            return res.status(400).json({
                ok: false,
                message: 'El motivo de la eliminación es obligatorio'
            });
        }

        // ==========================================
        // BUSCAR VENTA Y CUOTA
        // ==========================================
        const venta = await Venta.findById(idVenta);

        if (!venta) {
            return res.status(404).json({
                ok: false,
                message: 'Venta no encontrada'
            });
        }

        const cuota = venta.cuotas.find(c => c.numeroCuota === Number(numeroCuota));

        if (!cuota) {
            return res.status(404).json({
                ok: false,
                message: `Cuota ${numeroCuota} no encontrada`
            });
        }

        // ==========================================
        // BUSCAR RECARGO
        // ==========================================
        const recargo = cuota.recargos.id(idRecargo);

        if (!recargo) {
            return res.status(404).json({
                ok: false,
                message: 'Recargo no encontrado'
            });
        }

        // ==========================================
        // GUARDAR DATOS ANTES DE ELIMINAR (para trazabilidad)
        // ==========================================
        const recargoEliminado = {
            monto: recargo.monto,
            motivo: recargo.motivo,
            fecha: recargo.fecha,
            diasAtraso: recargo.diasAtraso,
            porcentajeAplicado: recargo.porcentajeAplicado,
            usuario: recargo.usuario
        };

        const fechaArgentina = new Date(new Date().toLocaleString('en-US', {
            timeZone: 'America/Argentina/Buenos_Aires'
        }));

        const nombreUsuario = usuario?.nombre || req.usuario?.nombre || 'Sistema';

        // ==========================================
        // ELIMINAR RECARGO
        // ==========================================
        cuota.recargos.pull(idRecargo);

        // ==========================================
        // AGREGAR NOTA DE TRAZABILIDAD
        // ==========================================
        cuota.notas.push({
            texto: `[RECARGO ELIMINADO] Se eliminó un recargo de $${recargoEliminado.monto}. Motivo original: "${recargoEliminado.motivo}". Motivo de eliminación: "${motivo.trim()}". Eliminado por: ${nombreUsuario}.`,
            fecha: fechaArgentina,
            usuario: {
                nombre: nombreUsuario
            }
        });

        // ==========================================
        // GUARDAR
        // ==========================================
        await venta.save();

        return res.status(200).json({
            ok: true,
            message: 'Recargo eliminado exitosamente',
            data: {
                ventaId: venta._id,
                numeroCuota: cuota.numeroCuota,
                recargoEliminado,
                motivoEliminacion: motivo.trim(),
                eliminadoPor: nombreUsuario,
                fechaEliminacion: fechaArgentina
            }
        });

    } catch (error) {
        console.error('Error al eliminar recargo:', error);

        if (error.name === 'CastError') {
            return res.status(400).json({
                ok: false,
                message: 'ID de venta o recargo inválido'
            });
        }

        return res.status(500).json({
            ok: false,
            message: `Error al eliminar recargo: ${error.message}`
        });
    }
};


const agregarRecargoACuota = async (req, res) => {
    try {
        const { idVenta, numeroCuota } = req.params;
        const {
            montoRecargo,
            motivo,
            porcentajeAplicado,
            usuario,
            fechaRecargo
        } = req.body;

        // ==========================================
        // VALIDACIONES
        // ==========================================
        if (!montoRecargo || montoRecargo <= 0) {
            return res.status(400).json({
                ok: false,
                message: 'El monto del recargo debe ser mayor a 0'
            });
        }

        if (!motivo || motivo.trim() === '') {
            return res.status(400).json({
                ok: false,
                message: 'El motivo del recargo es obligatorio'
            });
        }

        if (!usuario || !usuario.nombre) {
            return res.status(400).json({
                ok: false,
                message: 'El nombre del usuario es obligatorio'
            });
        }

        // ==========================================
        // BUSCAR VENTA
        // ==========================================
        const venta = await Venta.findById(idVenta);

        if (!venta) {
            return res.status(404).json({
                ok: false,
                message: 'Venta no encontrada'
            });
        }

        // ==========================================
        // VERIFICAR QUE EXISTA LA CUOTA
        // ==========================================
        const cuotaIndex = venta.cuotas.findIndex(c => c.numeroCuota === Number(numeroCuota));

        if (cuotaIndex === -1) {
            return res.status(404).json({
                ok: false,
                message: `Cuota número ${numeroCuota} no encontrada`
            });
        }

        const cuota = venta.cuotas[cuotaIndex];

        // ==========================================
        // VALIDAR ESTADO DE LA CUOTA
        // ==========================================
        if (cuota.estado_cuota === 'pagada') {
            return res.status(400).json({
                ok: false,
                message: 'No se puede agregar recargo a una cuota ya pagada'
            });
        }

        // ==========================================
        // CALCULAR DÍAS DE ATRASO (si no se envió)
        // ==========================================
        let diasAtraso = 0;
        if (cuota.fechaCobro) {
            const hoy = new Date();
            const fechaCobro = new Date(cuota.fechaCobro);
            const diffTime = Math.abs(hoy - fechaCobro);
            diasAtraso = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        // ==========================================
        // CREAR EL NUEVO RECARGO
        // ==========================================
        const nuevoRecargo = {
            monto: montoRecargo,
            motivo: motivo,
            fecha: fechaRecargo || new Date(),
            diasAtraso: diasAtraso,
            porcentajeAplicado: porcentajeAplicado || 0,
            usuario: {
                nombre: usuario.nombre
            }
        };

        // ==========================================
        // AGREGAR EL RECARGO AL ARRAY (MANUALMENTE)
        // ==========================================
        // Inicializar el array si no existe
        if (!cuota.recargos) {
            cuota.recargos = [];
        }

        // Agregar el recargo
        cuota.recargos.push(nuevoRecargo);

        // ==========================================
        // AGREGAR NOTA DE AUDITORÍA
        // ==========================================
        const fechaArgentina = new Date(new Date().toLocaleString('en-US', {
            timeZone: 'America/Argentina/Buenos_Aires'
        }));

        if (!cuota.notas) {
            cuota.notas = [];
        }

        cuota.notas.push({
            texto: `[RECARGO AGREGADO] $${montoRecargo.toLocaleString('es-AR')} - Motivo: ${motivo} - Días atraso: ${diasAtraso}`,
            fecha: fechaArgentina,
            usuario: {
                nombre: usuario.nombre
            }
        });

        // ==========================================
        // ACTUALIZAR ESTADO GENERAL DE LA VENTA
        // ==========================================
        // Si la cuota tiene recargo, la venta está en "atrasado"
        venta.conducta_pago = 'atrasado';

        // ==========================================
        // GUARDAR
        // ==========================================
        await venta.save();

        // ==========================================
        // CALCULAR TOTAL DE RECARGOS DE LA CUOTA
        // ==========================================
        const totalRecargos = cuota.recargos.reduce((total, r) => total + r.monto, 0);

        // ==========================================
        // RESPONDER
        // ==========================================
        return res.status(200).json({
            ok: true,
            message: 'Recargo agregado exitosamente',
            data: {
                numeroCuota: cuota.numeroCuota,
                montoCuota: cuota.montoCuota,
                totalRecargos: totalRecargos,
                totalConRecargos: cuota.montoCuota + totalRecargos,
                recargos: cuota.recargos,
                diasAtraso: diasAtraso,
                estadoCuota: cuota.estado_cuota,
                conductaPago: venta.conducta_pago,
                recargoAgregado: nuevoRecargo
            }
        });

    } catch (error) {
        console.error('Error al agregar recargo:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al agregar recargo: ${error.message}`
        });
    }
};

const cambiarEstadoCuota = async (req, res) => {
    try {
        const { idVenta, numeroCuota } = req.params;
        const { nuevoEstado, usuario, motivo, metodoPago, montoParcial } = req.body;

        // ==========================================
        // VALIDACIONES
        // ==========================================
        const estadosValidos = ["pagada", "pendiente", "pago parcial", "no pagada"];
        if (!nuevoEstado || !estadosValidos.includes(nuevoEstado)) {
            return res.status(400).json({
                ok: false,
                message: `Estado no válido. Debe ser: ${estadosValidos.join(', ')}`
            });
        }

        if (!usuario || !usuario.nombre) {
            return res.status(400).json({
                ok: false,
                message: 'El nombre del usuario es obligatorio'
            });
        }

        // ==========================================
        // BUSCAR VENTA Y CUOTA
        // ==========================================
        const venta = await Venta.findById(idVenta);

        if (!venta) {
            return res.status(404).json({
                ok: false,
                message: 'Venta no encontrada'
            });
        }

        const cuota = venta.cuotas.find(c => c.numeroCuota === Number(numeroCuota));

        if (!cuota) {
            return res.status(404).json({
                ok: false,
                message: `Cuota número ${numeroCuota} no encontrada`
            });
        }

        const estadoAnterior = cuota.estado_cuota;

        if (estadoAnterior === nuevoEstado) {
            return res.status(400).json({
                ok: false,
                message: `La cuota ya está en estado "${nuevoEstado}"`
            });
        }

        // ==========================================
        // FUNCIÓN PARA CALCULAR TOTAL DE RECARGOS
        // ==========================================
        const calcularTotalRecargos = (recargos) => {
            return recargos?.reduce((sum, r) => sum + r.monto, 0) || 0;
        };

        // ==========================================
        // ACTUALIZAR ESTADO
        // ==========================================
        const fechaArgentina = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));

        cuota.estado_cuota = nuevoEstado;

        // ==========================================
        // CASO: PAGADA
        // ==========================================
        if (nuevoEstado === 'pagada') {
            cuota.fechaCobrada = fechaArgentina;
            cuota.metodoPago = metodoPago || cuota.metodoPago || 'efectivo';
            
            // AGREGAR COBRADOR
            cuota.cobrador = {
                nombre: usuario.nombre
            };
            
            // Calcular total de recargos (sin modificar el array)
            const totalRecargos = calcularTotalRecargos(cuota.recargos);
            
            //  El monto pagado incluye capital + recargos
            cuota.montoPagado = cuota.montoCuota + totalRecargos;

            //  NO TOCAMOS LOS RECARGOS
            // Los dejamos exactamente como están para mantener el historial
            // NO hacemos: cuota.recargos = []
            // NO hacemos: recargo.monto = 0
        }

        // ==========================================
        // CASO: PAGO PARCIAL
        // ==========================================
        if (nuevoEstado === 'pago parcial') {
            cuota.metodoPago = metodoPago || cuota.metodoPago || 'efectivo';
            
            //  AGREGAR COBRADOR
            cuota.cobrador = {
                nombre: usuario.nombre
            };

            // Validar que venga montoParcial
            if (!montoParcial || montoParcial <= 0) {
                return res.status(400).json({
                    ok: false,
                    message: 'El monto parcial es obligatorio para pago parcial'
                });
            }

            //  Calcular total de la cuota (capital + recargos)
            const totalRecargos = calcularTotalRecargos(cuota.recargos);
            const totalCuota = cuota.montoCuota + totalRecargos;
            
            //  Monto acumulado (lo que ya pagó + lo que paga ahora)
            const montoAcumulado = (cuota.montoPagado || 0) + parseFloat(montoParcial);
            
            //  Validar que no supere el total de la cuota CON recargos
            if (montoAcumulado > totalCuota) {
                return res.status(400).json({
                    ok: false,
                    message: `El monto acumulado ($${montoAcumulado}) supera el total de la cuota con recargos ($${totalCuota})`
                });
            }

            //  Acumular el pago parcial
            cuota.montoPagado = montoAcumulado;

            //  Si ya cubre el total, pasar automáticamente a "pagada"
            if (cuota.montoPagado >= totalCuota) {
                cuota.estado_cuota = 'pagada';
                cuota.fechaCobrada = fechaArgentina;
                //  NO TOCAMOS LOS RECARGOS, solo cambiamos el estado
            }
        }

        // ==========================================
        // CASO: CAMBIO A PENDIENTE O NO PAGADA
        // ==========================================
        if ((estadoAnterior === 'pagada' || estadoAnterior === 'pago parcial') &&
            nuevoEstado !== 'pagada' && nuevoEstado !== 'pago parcial') {
            cuota.fechaCobrada = null;
            cuota.metodoPago = null;
            cuota.montoPagado = 0;
            cuota.cobrador = null;
            
            // Los recargos se mantienen intactos
            // No los tocamos en absoluto
        }

        // ==========================================
        // AGREGAR NOTA DE HISTORIAL
        // ==========================================
        let textoNota = `[CAMBIAR ESTADO] "${estadoAnterior}" → "${cuota.estado_cuota}". Motivo: ${motivo || 'Sin especificar'}`;

        if (nuevoEstado === 'pagada') {
            const totalRecargos = calcularTotalRecargos(cuota.recargos);
            textoNota += `. Total pagado: $${cuota.montoPagado.toLocaleString('es-AR')} (Capital: $${cuota.montoCuota.toLocaleString('es-AR')} + Recargos: $${totalRecargos.toLocaleString('es-AR')})`;
            
            // Detalle de los recargos pagados (sin modificarlos)
            if (totalRecargos > 0 && cuota.recargos) {
                textoNota += `. Detalle recargos: `;
                cuota.recargos.forEach((r, idx) => {
                    textoNota += `#${idx+1} $${r.monto.toLocaleString('es-AR')} (${r.motivo}) `;
                });
            }
        }

        if (nuevoEstado === 'pago parcial' && montoParcial) {
            const totalRecargos = calcularTotalRecargos(cuota.recargos);
            textoNota += `. Monto parcial: $${parseFloat(montoParcial).toLocaleString('es-AR')}. Total acumulado: $${cuota.montoPagado.toLocaleString('es-AR')}. Recargos pendientes: $${totalRecargos.toLocaleString('es-AR')}`;
        }

        cuota.notas.push({
            texto: textoNota,
            fecha: fechaArgentina,
            usuario: {
                nombre: usuario.nombre
            }
        });

        // ==========================================
        // RECALCULAR MONTO PAGADO DE LA VENTA
        // ==========================================
        const totalPagadoCuotas = venta.cuotas
            .reduce((total, c) => total + (c.montoPagado || 0), 0);

        venta.montoPagado = totalPagadoCuotas;

        // Sumar pagos iniciales si existen
        if (venta.pagos && venta.pagos.length > 0) {
            const pagosIniciales = venta.pagos.reduce((total, p) => total + p.monto, 0);
            venta.montoPagado += pagosIniciales;
        }

        // ==========================================
        // ACTUALIZAR CONDUCTA DE PAGO
        // ==========================================
        const cuotasNoPagadas = venta.cuotas.filter(c =>
            c.estado_cuota === 'no pagada'
        ).length;

        const todasPagadas = venta.cuotas.every(c => c.estado_cuota === 'pagada');

        if (todasPagadas) {
            venta.conducta_pago = 'cancelado';
        } else if (cuotasNoPagadas >= 4) {
            venta.conducta_pago = 'caducado';
        } else if (cuotasNoPagadas >= 2) {
            venta.conducta_pago = 'cobro judicial';
        } else if (cuotasNoPagadas >= 1) {
            venta.conducta_pago = 'atrasado';
        } else {
            venta.conducta_pago = 'al dia';
        }

        // ==========================================
        // GUARDAR
        // ==========================================
        await venta.save();

        // ==========================================
        // CALCULAR DATOS PARA RESPONDER
        // ==========================================
        const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
        hoy.setHours(0, 0, 0, 0);

        const cuotasVencidasNoPagadas = venta.cuotas.filter(c => {
            if (c.estado_cuota === 'pagada') return false;
            const fechaCobro = new Date(c.fechaCobro);
            return fechaCobro < hoy;
        }).length;

        const totalRecargos = calcularTotalRecargos(cuota.recargos);
        const totalCuotaReal = cuota.montoCuota + totalRecargos;
        const saldoPendiente = totalCuotaReal - (cuota.montoPagado || 0);

        return res.status(200).json({
            ok: true,
            message: 'Estado de cuota actualizado exitosamente',
            data: {
                numeroCuota: cuota.numeroCuota,
                estadoAnterior,
                estadoNuevo: cuota.estado_cuota,
                montoCuota: cuota.montoCuota,
                recargosPendientes: totalRecargos,
                montoPagado: cuota.montoPagado || 0,
                totalCuotaReal,
                saldoPendiente,
                montoPagadoTotalVenta: venta.montoPagado,
                conducta_pago: venta.conducta_pago,
                cuotasNoPagadas,
                cuotasVencidasNoPagadas,
                cobrador: cuota.cobrador,
                recargos: cuota.recargos || []  // Historial COMPLETO sin modificar
            }
        });

    } catch (error) {
        console.error('Error al cambiar estado de cuota:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al cambiar estado de cuota: ${error.message}`
        });
    }
};

const agregarNotaCuota = async (req, res) => {
    try {
        const { idVenta, numeroCuota } = req.params;
        const { texto, usuario } = req.body;

        // ==========================================
        // VALIDACIONES
        // ==========================================
        if (!texto || texto.trim() === '') {
            return res.status(400).json({
                ok: false,
                message: 'El texto de la nota es obligatorio'
            });
        }

        if (!usuario || !usuario.nombre) {
            return res.status(400).json({
                ok: false,
                message: 'El nombre del usuario es obligatorio'
            });
        }

        // ==========================================
        // BUSCAR VENTA Y CUOTA
        // ==========================================
        const venta = await Venta.findById(idVenta);

        if (!venta) {
            return res.status(404).json({
                ok: false,
                message: 'Venta no encontrada'
            });
        }

        const cuota = venta.cuotas.find(c => c.numeroCuota === Number(numeroCuota));

        if (!cuota) {
            return res.status(404).json({
                ok: false,
                message: `Cuota número ${numeroCuota} no encontrada`
            });
        }

        // ==========================================
        // AGREGAR NOTA
        // ==========================================
        const fechaArgentina = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));

        cuota.notas.push({
            texto: texto.trim(),
            fecha: fechaArgentina,
            usuario: {
                nombre: usuario.nombre
            }
        });

        await venta.save();

        return res.status(200).json({
            ok: true,
            message: 'Nota agregada exitosamente',
            data: {
                numeroCuota: cuota.numeroCuota,
                totalNotas: cuota.notas.length,
                ultimaNota: cuota.notas[cuota.notas.length - 1]
            }
        });

    } catch (error) {
        console.error('Error al agregar nota:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al agregar nota: ${error.message}`
        });
    }
};

///NUEVO PANEL PARA COBRANZAAA

const TZ = 'America/Argentina/Buenos_Aires';

// ==========================================
// Helpers de fecha
// ==========================================
const rangoMesArgentina = (mesStr) => {
    const match = /^(\d{4})-(\d{2})$/.exec(mesStr || '');
    if (!match) return null;
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    if (month < 1 || month > 12) return null;

    const mm = String(month).padStart(2, '0');
    const desdeStr = `${year}-${mm}-01T00:00:00-03:00`;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextMM = String(nextMonth).padStart(2, '0');
    const hastaStr = `${nextYear}-${nextMM}-01T00:00:00-03:00`;

    return { desde: new Date(desdeStr), hasta: new Date(hastaStr) };
};

const hoyInicioArgentina = () => {
    const ahora = new Date();
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(ahora);
    const y = partes.find(p => p.type === 'year').value;
    const m = partes.find(p => p.type === 'month').value;
    const d = partes.find(p => p.type === 'day').value;
    return new Date(`${y}-${m}-${d}T00:00:00-03:00`);
};

const diasEntre = (fecha, hoy) => {
    const MS_POR_DIA = 1000 * 60 * 60 * 24;
    const a = new Date(fecha).setUTCHours(0, 0, 0, 0);
    const b = new Date(hoy).setUTCHours(0, 0, 0, 0);
    return Math.round((b - a) / MS_POR_DIA);
};

const diasDiferencia = (fechaInicio, fechaFin) => {
    if (!fechaInicio || !fechaFin) return null;
    const MS_POR_DIA = 1000 * 60 * 60 * 24;
    const a = new Date(fechaInicio).setUTCHours(0, 0, 0, 0);
    const b = new Date(fechaFin).setUTCHours(0, 0, 0, 0);
    return Math.round((b - a) / MS_POR_DIA);
};

const formatearFechaARG = (date) => {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d);
};

// ==========================================
// Helpers de cálculo
// ==========================================
const sumarRecargos = (cuota) =>
    (cuota.recargos || []).reduce((sum, r) => sum + (r.monto || 0), 0);

const saldoCuota = (cuota) =>
    (cuota.montoCuota || 0) + sumarRecargos(cuota) - (cuota.montoPagado || 0);

// Esperado puro: NO resta lo pagado
const esperadoCuota = (cuota) =>
    (cuota.montoCuota || 0) + sumarRecargos(cuota);

const redondear2 = (n) => Math.round(n * 100) / 100;

const ESTADOS_IMPUESTOS = ['pendiente', 'pago parcial', 'no pagada'];
const TIPOS_VENTA_VALIDOS = ['sistema1', 'sistema2', 'plan_canje_cuotas'];

// ==========================================
// GET /cobranza/panel
// ==========================================
const getPanelCobranza = async (req, res) => {
    try {
        const { mes, nombre, localidad, tipoVenta } = req.query;

        const rango = rangoMesArgentina(mes);
        if (!rango) {
            return res.status(400).json({
                ok: false,
                message: 'El parámetro "mes" es obligatorio y debe tener formato YYYY-MM (ej. 2026-11)'
            });
        }
        const { desde, hasta } = rango;

        const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
        const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 20, 1), 100);

        const filtrosComunes = { estado: true };

        if (nombre && nombre.trim()) {
            const regex = new RegExp(nombre.trim(), 'i');
            filtrosComunes.$or = [
                { 'cliente.nombre': regex },
                { 'cliente.apellido': regex }
            ];
        }

        if (localidad && localidad.trim()) {
            filtrosComunes.localidad = localidad.trim().toLowerCase();
        }

        // Filtro tipoVenta
        if (tipoVenta && tipoVenta.trim()) {
            const tipo = tipoVenta.trim();
            if (!TIPOS_VENTA_VALIDOS.includes(tipo)) {
                return res.status(400).json({
                    ok: false,
                    message: `Tipo de venta inválido: "${tipo}". Válidos: ${TIPOS_VENTA_VALIDOS.join(', ')}`
                });
            }
            filtrosComunes.tipoVenta = tipo;
        }

        // ==========================================
        // Query A: ventas con ≥1 cuota con fechaCobro en el mes
        // ==========================================
        const filtroMes = {
            ...filtrosComunes,
            cuotas: {
                $elemMatch: { fechaCobro: { $gte: desde, $lt: hasta } }
            }
        };

        // ==========================================
        // Query B: pagosDestiempo (solo Caso A)
        // ==========================================
        const filtroPagosDestiempo = {
            ...filtrosComunes,
            cuotas: {
                $elemMatch: {
                    fechaCobro: { $gte: desde, $lt: hasta },
                    estado_cuota: 'pagada',
                    fechaCobrada: { $ne: null },
                    $or: [
                        { fechaCobrada: { $lt: desde } },
                        { fechaCobrada: { $gte: hasta } }
                    ]
                }
            }
        };

        const [ventasDB, ventasPD_DB] = await Promise.all([
            Venta.find(filtroMes).lean(),
            Venta.find(filtroPagosDestiempo)
                .select('_id numeroContrato cliente producto cuotas')
                .lean()
        ]);

        const hoy = hoyInicioArgentina();

        // ==========================================
        // PROCESAMIENTO QUERY A
        // ==========================================
        let aCobrar = 0;
        let cobrado = 0;
        let vencido = 0;

        const contadoresTabs = { porVencer: 0, enMora: 0, legal: 0, cobradas: 0 };
        const ventasProcesadas = [];

        for (const venta of ventasDB) {
            const cuotas = venta.cuotas || [];

            const cuotasDelMes = cuotas.filter(c =>
                c.fechaCobro && c.fechaCobro >= desde && c.fechaCobro < hasta
            );

            if (cuotasDelMes.length === 0) continue;

            // ---------- resumen ----------
            for (const c of cuotasDelMes) {
                // aCobrar: esperado puro
                aCobrar += esperadoCuota(c);

                // cobrado: pagada o pago parcial, fechaCobrada dentro del mes
                if (
                    ['pagada', 'pago parcial'].includes(c.estado_cuota) &&
                    c.fechaCobrada &&
                    c.fechaCobrada >= desde &&
                    c.fechaCobrada < hasta
                ) {
                    cobrado += c.montoPagado || 0;
                }

                // vencido: no pagada con recargos → saldo real pendiente
                if (
                    c.estado_cuota === 'no pagada' &&
                    (c.recargos || []).length > 0
                ) {
                    vencido += saldoCuota(c);
                }
            }

            // ---------- resumen cuotas ----------
            const totalDelMes = cuotasDelMes.length;
            const pagadasDelMes = cuotasDelMes.filter(c => c.estado_cuota === 'pagada').length;
            const pendientesDelMes = cuotasDelMes.filter(c =>
                ['pendiente', 'pago parcial'].includes(c.estado_cuota)
            ).length;
            const atrasadasDelMes = cuotasDelMes.filter(c =>
                c.estado_cuota === 'no pagada' ||
                (['pendiente', 'pago parcial'].includes(c.estado_cuota) && c.fechaCobro < hoy)
            ).length;

            // ---------- tabs ----------
            const todasPagadasEnMes = cuotasDelMes.every(c =>
                c.estado_cuota === 'pagada' &&
                c.fechaCobrada &&
                c.fechaCobrada >= desde &&
                c.fechaCobrada < hasta
            );
            if (todasPagadasEnMes) {
                contadoresTabs.cobradas += 1;
            }
            if (venta.conducta_pago === 'cobro judicial') {
                contadoresTabs.legal += 1;
            }

            // ---------- proximaCuota ----------
            const impagasDelMes = cuotasDelMes.filter(c =>
                ESTADOS_IMPUESTOS.includes(c.estado_cuota)
            );
            const enMora = impagasDelMes
                .filter(c => c.fechaCobro < hoy)
                .sort((a, b) => a.fechaCobro - b.fechaCobro);
            const porVencerList = impagasDelMes
                .filter(c => c.fechaCobro >= hoy)
                .sort((a, b) => a.fechaCobro - b.fechaCobro);
            const proximaCuotaRaw = enMora[0] || porVencerList[0] || null;

            let proximaCuota = null;
            if (proximaCuotaRaw) {
                const recargosTotal = sumarRecargos(proximaCuotaRaw);
                const saldo = saldoCuota(proximaCuotaRaw);
                const esFutura = proximaCuotaRaw.fechaCobro >= hoy;

                proximaCuota = {
                    numeroCuota: proximaCuotaRaw.numeroCuota,
                    montoCuota: proximaCuotaRaw.montoCuota,
                    montoPagado: proximaCuotaRaw.montoPagado || 0,
                    fechaCobro: proximaCuotaRaw.fechaCobro,
                    recargos: recargosTotal,
                    saldoPendiente: saldo,
                    estado_cuota: proximaCuotaRaw.estado_cuota,
                    ...(esFutura
                        ? { diasRestantes: diasEntre(proximaCuotaRaw.fechaCobro, hoy) * -1 }
                        : { diasAtraso: diasEntre(proximaCuotaRaw.fechaCobro, hoy) })
                };

                if (proximaCuota.fechaCobro >= hoy) {
                    contadoresTabs.porVencer += 1;
                } else if (proximaCuota.estado_cuota === 'no pagada') {
                    contadoresTabs.enMora += 1;
                }
            }

            // 🆕 cuotaCobrada: si no hay próxima cuota, devolvemos la última pagada
            let cuotaCobrada = null;
            if (!proximaCuota) {
                const cuotasPagadas = cuotasDelMes.filter(c => c.estado_cuota === 'pagada');
                cuotasPagadas.sort((a, b) => new Date(b.fechaCobrada) - new Date(a.fechaCobrada));

                const ultimaPagada = cuotasPagadas[0];
                if (ultimaPagada) {
                    cuotaCobrada = {
                        numeroCuota: ultimaPagada.numeroCuota,
                        montoCuota: ultimaPagada.montoCuota,
                        montoPagado: ultimaPagada.montoPagado || 0,
                        fechaCobro: ultimaPagada.fechaCobro,
                        fechaCobrada: ultimaPagada.fechaCobrada,
                        recargos: sumarRecargos(ultimaPagada),
                        estado_cuota: ultimaPagada.estado_cuota
                    };
                }
            }

            // ---------- ultimoContacto ----------
            const candidatas = [];
            (venta.notas || []).forEach(n => {
                if (n.fecha && n.texto) {
                    candidatas.push({ texto: n.texto, fecha: n.fecha, origen: 'venta' });
                }
            });
            cuotasDelMes.forEach(c => {
                (c.notas || []).forEach(n => {
                    if (n.fecha && n.texto) {
                        candidatas.push({ texto: n.texto, fecha: n.fecha, origen: 'cuota' });
                    }
                });
            });
            candidatas.sort((a, b) => b.fecha - a.fecha);
            const ultimoContacto = candidatas[0] || null;

            // Todas las ventas entran a ventas[] (pagadas incluidas)
            ventasProcesadas.push({
                _id: venta._id,
                numeroContrato: venta.numeroContrato || null,
                numeroContratoFormateado: venta.numeroContrato
                    ? String(venta.numeroContrato).padStart(5, '0') : null,
                tipoVenta: venta.tipoVenta,
                fechaRealizada: venta.fechaRealizada,
                localidad: venta.localidad,
                conducta_pago: venta.conducta_pago,
                cliente: {
                    nombre: venta.cliente?.nombre || '',
                    apellido: venta.cliente?.apellido || '',
                    dni: venta.cliente?.dni || '',
                    telefono: venta.cliente?.telefono || ''
                },
                producto: {
                    nombre: venta.producto?.nombre || '',
                    modelo: venta.producto?.modelo || '',
                    capacidad: venta.producto?.capacidad || '',
                    imei: venta.producto?.imei || null
                },
                cuotas: {
                    total: totalDelMes,
                    pagadas: pagadasDelMes,
                    pendientes: pendientesDelMes,
                    atrasadas: atrasadasDelMes
                },
                proximaCuota,
                cuotaCobrada, // 🆕
                ultimoContacto
            });
        }

        ventasProcesadas.sort((a, b) => {
            const fa = a.proximaCuota?.fechaCobro
                ? new Date(a.proximaCuota.fechaCobro).getTime() : Infinity;
            const fb = b.proximaCuota?.fechaCobro
                ? new Date(b.proximaCuota.fechaCobro).getTime() : Infinity;
            return fa - fb;
        });

        const totalVentas = ventasProcesadas.length;
        const totalPaginas = Math.max(Math.ceil(totalVentas / limite), 1);
        const skip = (pagina - 1) * limite;
        const ventasPaginadas = ventasProcesadas.slice(skip, skip + limite);

        const efectividad = aCobrar > 0
            ? redondear2((cobrado / aCobrar) * 100)
            : 0;

        // ==========================================
        // PROCESAMIENTO QUERY B → pagosDestiempo
        // ==========================================
        let pdCantidad = 0;
        let pdMonto = 0;
        const pdDetalle = [];

        for (const venta of ventasPD_DB) {
            for (const cuota of venta.cuotas || []) {
                if (cuota.estado_cuota !== 'pagada' || !cuota.fechaCobrada || !cuota.fechaCobro) continue;

                const cobroEnMes = cuota.fechaCobro >= desde && cuota.fechaCobro < hasta;
                const cobradaFueraDelMes = cuota.fechaCobrada < desde || cuota.fechaCobrada >= hasta;

                if (!(cobroEnMes && cobradaFueraDelMes)) continue;

                pdCantidad += 1;
                pdMonto += cuota.montoPagado || 0;

                pdDetalle.push({
                    ventaId: venta._id,
                    numeroContratoFormateado: venta.numeroContrato
                        ? String(venta.numeroContrato).padStart(5, '0') : null,
                    cliente: {
                        nombre: venta.cliente?.nombre || '',
                        apellido: venta.cliente?.apellido || '',
                        dni: venta.cliente?.dni || ''
                    },
                    producto: venta.producto?.nombre || '',
                    numeroCuota: cuota.numeroCuota,
                    montoCuota: cuota.montoCuota || 0,
                    montoPagado: cuota.montoPagado || 0,
                    fechaCobroOriginal: formatearFechaARG(cuota.fechaCobro),
                    fechaCobrada: formatearFechaARG(cuota.fechaCobrada),
                    diasAtraso: diasDiferencia(cuota.fechaCobro, cuota.fechaCobrada),
                    metodoPago: cuota.metodoPago || null
                });
            }
        }

        pdDetalle.sort((a, b) => {
            if (a.fechaCobrada < b.fechaCobrada) return -1;
            if (a.fechaCobrada > b.fechaCobrada) return 1;
            return 0;
        });

        return res.status(200).json({
            ok: true,
            data: {
                resumen: {
                    aCobrar: redondear2(aCobrar),
                    cobrado: redondear2(cobrado),
                    vencido: redondear2(vencido),
                    efectividad
                },
                contadoresTabs,
                ventas: ventasPaginadas,
                pagosDestiempo: {
                    resumen: {
                        cantidadCuotas: pdCantidad,
                        montoTotal: redondear2(pdMonto)
                    },
                    detalle: pdDetalle
                },
                paginacion: { pagina, limite, totalVentas, totalPaginas }
            }
        });

    } catch (error) {
        console.error('Error al obtener panel de cobranza:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al obtener panel de cobranza: ${error.message}`
        });
    }
};



module.exports = {
    listarVentasCobranza,
    detalleVentaCobranza,
    cobrarCuotas,
    ////////////
    editarFechaCuota,
    editarMontoCuota,
    ////////////////////
    agregarRecargoACuota,
    editarRecargo,
    eliminarRecargo,

    cambiarEstadoCuota,
    agregarNotaCuota,


    //nuevo panel
    getPanelCobranza,
    


};