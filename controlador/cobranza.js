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
        const {
            idVenta,
            cuotas,
            cobrador,
            nota
        } = req.body;

        // ==========================================
        // VALIDACIONES
        // ==========================================
        if (!idVenta) {
            return res.status(400).json({
                ok: false,
                message: 'El ID de la venta es obligatorio'
            });
        }

        if (!cuotas || !Array.isArray(cuotas) || cuotas.length === 0) {
            return res.status(400).json({
                ok: false,
                message: 'Debe especificar al menos una cuota para cobrar'
            });
        }

        if (!cobrador || !cobrador.nombre) {
            return res.status(400).json({
                ok: false,
                message: 'El nombre del cobrador es obligatorio'
            });
        }

        // Validar cada cuota
        for (const cuota of cuotas) {
            if (!cuota.numeroCuota || !cuota.metodoPago) {
                return res.status(400).json({
                    ok: false,
                    message: `Cada cuota debe tener numeroCuota y metodoPago`
                });
            }
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

        if (!venta.estado) {
            return res.status(400).json({
                ok: false,
                message: 'La venta está inactiva'
            });
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
                cuotasConError.push({
                    numeroCuota: cuotaData.numeroCuota,
                    error: 'Cuota no encontrada'
                });
                continue;
            }

            if (cuota.estado_cuota === 'pagada') {
                cuotasConError.push({
                    numeroCuota: cuotaData.numeroCuota,
                    error: 'Cuota ya está pagada'
                });
                continue;
            }

            // ==========================================
            // CALCULAR TOTAL DE LA CUOTA (CON RECARGOS)
            // ==========================================
            // Calcular total de recargos acumulados
            const totalRecargos = cuota.recargos?.reduce((sum, r) => sum + r.monto, 0) || 0;
            const totalCuota = cuota.montoCuota + totalRecargos;

            // ==========================================
            // MARCAR COMO PAGADA
            // ==========================================
            cuota.estado_cuota = 'pagada';
            cuota.fechaCobrada = fechaPago;
            cuota.metodoPago = cuotaData.metodoPago;
            cuota.montoPagado = totalCuota; // Incluye recargos
            cuota.cobrador = {
                nombre: cobrador.nombre
            };

            // ==========================================
            // AGREGAR NOTA DE PAGO (con recargos incluidos)
            // ==========================================
            const textoNota = cuotaData.nota || nota;
            if (textoNota && textoNota.trim() !== '') {
                cuota.notas.push({
                    texto: textoNota,
                    fecha: fechaPago,
                    usuario: {
                        nombre: cobrador.nombre
                    }
                });
            }

            // ==========================================
            // AGREGAR NOTA SOBRE RECARGOS (si los había)
            // ==========================================
            if (totalRecargos > 0) {
                cuota.notas.push({
                    texto: `[RECARGOS PAGADOS] Se cobraron $${totalRecargos.toLocaleString('es-AR')} en recargos acumulados (${cuota.recargos.length} recargo(s))`,
                    fecha: fechaPago,
                    usuario: {
                        nombre: cobrador.nombre
                    }
                });
            }

            cuotasProcesadas.push({
                numeroCuota: cuota.numeroCuota,
                montoCuota: cuota.montoCuota,
                totalRecargos: totalRecargos,
                montoPagado: cuota.montoPagado, // Incluye recargos
                estado: 'pagada'
            });
        }

        // ==========================================
        // RECALCULAR MONTOS (CON RECARGOS)
        // ==========================================

        // 👉 Suma lo REALMENTE pagado de cada cuota (incluye recargos)
        const totalPagadoCuotas = venta.cuotas
            .reduce((total, c) => total + (c.montoPagado || 0), 0);

        venta.montoPagado = totalPagadoCuotas;

        // Sumar pagos iniciales si existen (anticipo/entrega inicial)
        if (venta.pagos && venta.pagos.length > 0) {
            const pagosIniciales = venta.pagos.reduce((total, p) => total + p.monto, 0);
            venta.montoPagado += pagosIniciales;
        }

        // ==========================================
        // ACTUALIZAR CONDUCTA DE PAGO
        // ==========================================
        const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
        hoy.setHours(0, 0, 0, 0);

        // Contar cuotas en estado "no pagada"
        const cuotasNoPagadas = venta.cuotas.filter(c =>
            c.estado_cuota === 'no pagada'
        ).length;

        // Verificar si todas están pagadas
        const todasPagadas = venta.cuotas.every(c => c.estado_cuota === 'pagada');

        // Aplicar reglas de conducta basadas en comportamiento real
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

        // Calcular cuotas vencidas (solo informativo)
        const cuotasVencidasNoPagadas = venta.cuotas.filter(c => {
            if (c.estado_cuota === 'pagada') return false;
            const fechaCobro = new Date(c.fechaCobro);
            return fechaCobro < hoy;
        }).length;

        // ==========================================
        // GUARDAR
        // ==========================================
        await venta.save();

        // 👉 Calcular monto pendiente real (incluye recargos de cuotas pendientes)
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
                    // ✅ Información extra sobre recargos
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
    agregarNotaCuota

};