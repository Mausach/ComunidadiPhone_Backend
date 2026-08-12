const Venta = require("../modelos/Venta");



const listarVentasCobranza = async (req, res) => {
    try {
        const {
            dni,
            nombre,
            estado,        // conducta_pago
            fechaDesde,    // Para filtrar por fecha de cuota
            fechaHasta,    // Para filtrar por fecha de cuota
            fechaVentaDesde, // Para filtrar por fecha de venta
            fechaVentaHasta, // Para filtrar por fecha de venta
            localidad,
            tipoVenta,
            pagina = 1,
            limite = 20
        } = req.query;

        // ==========================================
        // CONSTRUIR FILTROS
        // ==========================================
        const filtros = {
            estado: true,
            cuotas: { $exists: true, $ne: [] }
        };

        // Filtro por DNI
        if (dni) {
            filtros['cliente.dni'] = dni.trim();
        }

        // Filtro por nombre (búsqueda parcial)
        if (nombre) {
            filtros['cliente.nombre'] = { $regex: nombre.trim(), $options: 'i' };
        }

        // Filtro por conducta_pago
        if (estado) {
            filtros.conducta_pago = estado;
        }

        // Filtro por localidad
        if (localidad) {
            filtros.localidad = localidad.toLowerCase().trim();
        }

        // Filtro por tipo de venta
        if (tipoVenta) {
            filtros.tipoVenta = tipoVenta;
        }

        // ==========================================
        // FILTRO POR FECHA DE VENTA (fechaRealizada)
        // ==========================================
        if (fechaVentaDesde || fechaVentaHasta) {
            filtros.fechaRealizada = {};
            if (fechaVentaDesde) {
                filtros.fechaRealizada.$gte = new Date(fechaVentaDesde + 'T00:00:00-03:00');
            }
            if (fechaVentaHasta) {
                filtros.fechaRealizada.$lte = new Date(fechaVentaHasta + 'T23:59:59-03:00');
            }
        }

        // ==========================================
        // FILTRO POR FECHA DE CUOTA (fechaCobro)
        // ==========================================
        if (fechaDesde || fechaHasta) {
            const condicionesFecha = {};

            if (fechaDesde) {
                condicionesFecha.$gte = new Date(fechaDesde + 'T00:00:00-03:00');
            }
            if (fechaHasta) {
                condicionesFecha.$lte = new Date(fechaHasta + 'T23:59:59-03:00');
            }

            filtros.cuotas = {
                $elemMatch: {
                    fechaCobro: condicionesFecha
                }
            };
        }

        // ==========================================
        // CALCULAR PAGINACIÓN
        // ==========================================
        const skip = (parseInt(pagina) - 1) * parseInt(limite);
        const limit = parseInt(limite);

        // ==========================================
        // CONSULTAR
        // ==========================================
        const [ventas, total] = await Promise.all([
            Venta.find(filtros)
                .select('cliente.nombre cliente.apellido cliente.dni producto.nombre producto.modelo localidad tipoVenta fechaRealizada montoTotal montoPagado conducta_pago cuotas')
                .sort({ fechaRealizada: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Venta.countDocuments(filtros)
        ]);

        // ==========================================
        // FORMATEAR RESPUESTA (agregar datos calculados)
        // ==========================================
        const ventasFormateadas = ventas.map(venta => {
            const cuotasPendientes = venta.cuotas.filter(c => c.estado_cuota === 'pendiente').length;
            const cuotasPagadas = venta.cuotas.filter(c => c.estado_cuota === 'pagada').length;
            const cuotasAtrasadas = venta.cuotas.filter(c => c.estado_cuota === 'no pagada').length;
            const totalCuotas = venta.cuotas.length;

           
            const montoPendiente = venta.cuotas
                .filter(c => c.estado_cuota !== 'pagada')
                .reduce((total, c) => {
                    const totalRecargos = (c.recargos || []).reduce((s, r) => s + r.monto, 0);
                    const pendienteCuota = (c.montoCuota + totalRecargos) - (c.montoPagado || 0);
                    return total + pendienteCuota;
                }, 0);

            // 👉 CORREGIDO: montoPagado total = suma de montoPagado de todas las cuotas
            const montoPagadoCalculado = venta.cuotas
                .reduce((total, c) => total + (c.montoPagado || 0), 0);

            // Buscar si alguna cuota coincide con el rango de fechas de cuota
            let cuotasEnRango = [];
            if (fechaDesde || fechaHasta) {
                cuotasEnRango = venta.cuotas.filter(cuota => {
                    let cumple = true;
                    if (fechaDesde) {
                        cumple = cumple && new Date(cuota.fechaCobro) >= new Date(fechaDesde + 'T00:00:00-03:00');
                    }
                    if (fechaHasta) {
                        cumple = cumple && new Date(cuota.fechaCobro) <= new Date(fechaHasta + 'T23:59:59-03:00');
                    }
                    return cumple;
                });
            }

            // Encontrar la cuota más próxima
            const hoy = new Date();
            const cuotaProxima = venta.cuotas
                .filter(c => c.estado_cuota === 'pendiente' || c.estado_cuota === 'pago parcial')
                .sort((a, b) => new Date(a.fechaCobro) - new Date(b.fechaCobro))[0];

            return {
                _id: venta._id,
                cliente: venta.cliente,
                producto: venta.producto,
                localidad: venta.localidad,
                tipoVenta: venta.tipoVenta,
                fechaRealizada: venta.fechaRealizada,
                montoTotal: venta.montoTotal,
                montoPagado: montoPagadoCalculado,
                montoPendiente,
                conducta_pago: venta.conducta_pago,
                cuotas: {
                    total: totalCuotas,
                    pagadas: cuotasPagadas,
                    pendientes: cuotasPendientes,
                    atrasadas: cuotasAtrasadas
                },
                // Datos de la próxima cuota
                proximaCuota: cuotaProxima ? {
                    numeroCuota: cuotaProxima.numeroCuota,
                    montoCuota: cuotaProxima.montoCuota,
                    montoPagado: cuotaProxima.montoPagado || 0,
                    fechaCobro: cuotaProxima.fechaCobro,
                    diasRestantes: Math.ceil((new Date(cuotaProxima.fechaCobro) - hoy) / (1000 * 60 * 60 * 24))
                } : null,
                // Cuotas que coinciden con el filtro de fechas
                cuotasEnRango: cuotasEnRango.length > 0 ? cuotasEnRango.map(c => ({
                    numeroCuota: c.numeroCuota,
                    fechaCobro: c.fechaCobro,
                    estado_cuota: c.estado_cuota,
                    montoPagado: c.montoPagado || 0
                })) : []
            };
        });

        return res.status(200).json({
            ok: true,
            message: 'Ventas encontradas',
            data: ventasFormateadas,
            paginacion: {
                total,
                pagina: parseInt(pagina),
                limite: limit,
                paginas: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Error al listar ventas:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al listar ventas: ${error.message}`
        });
    }
};

//lista las ventas y cuotas del dia
const listarCobranzasDelDia = async (req, res) => {
    try {
        const {
            localidad,
            vendedor,
            pagina = 1,
            limite = 20
        } = req.query;

        // ==========================================
        // CALCULAR HOY EN ARGENTINA
        // ==========================================
        const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
        const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0);
        const finHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);

        // Convertir a UTC para la consulta (Argentina = UTC-3)
        // BIEN (Argentina está UTC-3, hay que restar para convertir a UTC)
        const inicioUTC = new Date(inicioHoy.getTime() - (3 * 60 * 60 * 1000));
        const finUTC = new Date(finHoy.getTime() - (3 * 60 * 60 * 1000));

        // ==========================================
        // CONSTRUIR FILTROS
        // ==========================================
        const filtros = {
            estado: true,
            frecuenciaCuota: { $ne: null },
            'cuotas.fechaCobro': { $gte: inicioUTC, $lte: finUTC }
        };

        // Filtro por localidad
        if (localidad) {
            filtros.localidad = localidad.toLowerCase().trim();
        }

        // Filtro por vendedor
        if (vendedor) {
            filtros.vendedor = vendedor.trim();
        }

        // ==========================================
        // CALCULAR PAGINACIÓN
        // ==========================================
        const skip = (parseInt(pagina) - 1) * parseInt(limite);
        const limit = parseInt(limite);

        // ==========================================
        // CONSULTAR
        // ==========================================
        const [ventas, total] = await Promise.all([
            Venta.find(filtros)
                .select('cliente localidad tipoVenta vendedor fechaRealizada montoTotal montoPagado conducta_pago frecuenciaCuota cuotas')
                .sort({ 'cliente.apellido': 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Venta.countDocuments(filtros)
        ]);

        // ==========================================
        // FORMATEAR RESPUESTA
        // ==========================================
        const ventasFormateadas = ventas.map(venta => {
            // Filtrar solo las cuotas de hoy
            const cuotasHoy = venta.cuotas.filter(c => {
                const fechaCobro = new Date(c.fechaCobro);
                return fechaCobro >= inicioUTC && fechaCobro <= finUTC;
            });

            // Totales de la venta
            const totalCuotas = venta.cuotas.length;
            const cuotasPagadas = venta.cuotas.filter(c => c.estado_cuota === 'pagada').length;
            const cuotasPendientes = venta.cuotas.filter(c => c.estado_cuota === 'pendiente').length;
            const cuotasAtrasadas = venta.cuotas.filter(c => c.estado_cuota === 'no pagada').length;
            const cuotasPagoParcial = venta.cuotas.filter(c => c.estado_cuota === 'pago parcial').length;
            const montoPendiente = venta.montoTotal - (venta.montoPagado || 0);

            return {
                _id: venta._id,
                cliente: venta.cliente,
                localidad: venta.localidad,
                tipoVenta: venta.tipoVenta,
                vendedor: venta.vendedor,
                frecuenciaCuota: venta.frecuenciaCuota,
                fechaRealizada: venta.fechaRealizada,
                montoTotal: venta.montoTotal,
                montoPagado: venta.montoPagado || 0,
                montoPendiente,
                conducta_pago: venta.conducta_pago,
                cuotas: {
                    total: totalCuotas,
                    pagadas: cuotasPagadas,
                    pendientes: cuotasPendientes,
                    atrasadas: cuotasAtrasadas,
                    pagoParcial: cuotasPagoParcial
                },
                cuotasHoy: cuotasHoy.map(c => ({
                    numeroCuota: c.numeroCuota,
                    montoCuota: c.montoCuota,
                    estadoCuota: c.estado_cuota,
                    metodoPago: c.metodoPago,
                    fechaCobro: c.fechaCobro,
                    fechaCobrada: c.fechaCobrada,
                    cobrador: c.cobrador,
                    notas: c.notas
                })),
                totalCobrarHoy: cuotasHoy.reduce((sum, c) => {
                    return sum + (c.estado_cuota === 'pendiente' || c.estado_cuota === 'pago parcial' ? c.montoCuota : 0);
                }, 0)
            };
        });

        // Totales del día
        const totalesDia = ventasFormateadas.reduce((acc, venta) => {
            acc.totalVentas += 1;
            acc.totalCobrarHoy += venta.totalCobrarHoy;
            acc.cuotasPendientesHoy += venta.cuotasHoy.filter(c => c.estadoCuota === 'pendiente').length;
            acc.cuotasPagadasHoy += venta.cuotasHoy.filter(c => c.estadoCuota === 'pagada').length;
            acc.cuotasAtrasadasHoy += venta.cuotasHoy.filter(c => c.estadoCuota === 'no pagada').length;
            return acc;
        }, {
            totalVentas: 0,
            totalCobrarHoy: 0,
            cuotasPendientesHoy: 0,
            cuotasPagadasHoy: 0,
            cuotasAtrasadasHoy: 0
        });

        return res.status(200).json({
            ok: true,
            message: `Cobranzas del día ${ahora.toLocaleDateString('es-AR')}`,
            fecha: ahora,
            totalesDia,
            data: ventasFormateadas,
            paginacion: {
                total,
                pagina: parseInt(pagina),
                limite: limit,
                paginas: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Error al listar cobranzas del día:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al listar cobranzas del día: ${error.message}`
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
//nuevo recargo o interes ESTE SE ELIMINARA O NO SE UTILIZARA

const editarRecargoCuota = async (req, res) => {
    try {
        const { idVenta, numeroCuota } = req.params;
        const {
            nuevoMontoRecargo,  // Puede ser 0 para eliminar el recargo
            motivo,
            usuario,
            fechaRecargo      // Opcional, si quieren poner fecha específica
        } = req.body;

        // ==========================================
        // VALIDACIONES
        // ==========================================
        // Validar que el monto no sea negativo
        if (nuevoMontoRecargo === undefined || nuevoMontoRecargo === null) {
            return res.status(400).json({
                ok: false,
                message: 'El monto del recargo es obligatorio'
            });
        }

        if (nuevoMontoRecargo < 0) {
            return res.status(400).json({
                ok: false,
                message: 'El recargo no puede ser negativo'
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
        // VALIDAR ESTADO DE LA CUOTA
        // ==========================================
        if (cuota.estado_cuota === 'pagada') {
            return res.status(400).json({
                ok: false,
                message: 'No se puede modificar recargo de una cuota ya pagada'
            });
        }

        // ==========================================
        // GUARDAR RECARGO ANTERIOR
        // ==========================================
        const recargoAnterior = cuota.recargo?.monto || 0;
        const motivoAnterior = cuota.recargo?.motivo || 'Sin recargo previo';
        const diferencia = nuevoMontoRecargo - recargoAnterior;

        // ==========================================
        // ACTUALIZAR RECARGO
        // ==========================================
        // Si el nuevo recargo es 0, limpiar el objeto (opcional)
        if (nuevoMontoRecargo === 0) {
            cuota.recargo = {
                monto: 0,
                motivo: 'Recargo eliminado',
                fecha: new Date(),
                usuario: { nombre: usuario.nombre }
            };
        } else {
            // Actualizar con los nuevos datos
            cuota.recargo = {
                monto: nuevoMontoRecargo,
                motivo: motivo || 'Recargo por mora',  // Motivo por defecto si no se especifica
                fecha: fechaRecargo || new Date(),
                usuario: {
                    nombre: usuario.nombre
                }
            };
        }

        // ==========================================
        // ACTUALIZAR MONTO TOTAL DE LA CUOTA
        // ¡IMPORTANTE! El montoCuota + recargo = lo que debe pagar
        // ==========================================
        // El montoCuota no se toca, solo se actualiza el recargo
        // El total a pagar de esta cuota sería: montoCuota + recargo.monto

        // Pero si queremos actualizar el montoTotal de la VENTA:
        // Solo si el recargo afecta el total de la venta
        // En tu modelo, el montoTotal es el valor del producto, 
        // los recargos son adicionales, así que NO deberían modificar montoTotal
        // (Deberías tener otro campo como "totalConRecargos" o calcularlo en el frontend)

        // ==========================================
        // AGREGAR NOTA DE HISTORIAL
        // ==========================================
        const fechaArgentina = new Date(new Date().toLocaleString('en-US', {
            timeZone: 'America/Argentina/Buenos_Aires'
        }));

        let textoNota = '';
        if (nuevoMontoRecargo === 0) {
            textoNota = `[RECARGO ELIMINADO] Recargo anterior: $${recargoAnterior.toLocaleString('es-AR')} (Motivo: ${motivoAnterior}). Eliminado por: ${usuario.nombre}`;
        } else {
            textoNota = `[RECARGO ACTUALIZADO] $${recargoAnterior.toLocaleString('es-AR')} → $${nuevoMontoRecargo.toLocaleString('es-AR')} (Diferencia: $${diferencia.toLocaleString('es-AR')}). Motivo: ${motivo || 'Sin especificar'}. Usuario: ${usuario.nombre}`;
        }

        cuota.notas.push({
            texto: textoNota,
            fecha: fechaArgentina,
            usuario: {
                nombre: usuario.nombre
            }
        });

        // ==========================================
        // RECALCULAR ESTADO DE LA CUOTA (opcional)
        // ==========================================
        // Si el recargo se aplica, podrías querer actualizar el estado de la cuota
        // Por ejemplo, si tiene recargo, cambiar a "con mora" o algo similar
        // Pero manteniendo el estado original

        await venta.save();

        // ==========================================
        // RESPONDER
        // ==========================================
        return res.status(200).json({
            ok: true,
            message: nuevoMontoRecargo === 0 ? 'Recargo eliminado exitosamente' : 'Recargo actualizado exitosamente',
            data: {
                numeroCuota: cuota.numeroCuota,
                recargoAnterior,
                recargoNuevo: nuevoMontoRecargo,
                diferencia,
                motivo: cuota.recargo.motivo,
                fechaRecargo: cuota.recargo.fecha,
                estadoCuota: cuota.estado_cuota,
                montoCuota: cuota.montoCuota,
                totalCuotaConRecargo: cuota.montoCuota + cuota.recargo.monto,
                notas: cuota.notas
            }
        });

    } catch (error) {
        console.error('Error al editar recargo de cuota:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al editar recargo: ${error.message}`
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
    agregarRecargoACuota,
    cambiarEstadoCuota,
    agregarNotaCuota

};