
const Equipos = require("../modelos/Equipos");
const EquipoStock = require("../modelos/EquipoStock");
const EqupoCanjes = require("../modelos/EqupoCanjes");
const Gastos = require("../modelos/Gastos");
const Venta = require("../modelos/Venta");
const Cliente = require("../modelos/Cliente");

// Reporte de cobranza mensual

const reporteCobranzaMensual = async (req, res) => {
    const { mes, anio } = req.query;

    try {
        // ==========================================
        // VALIDACIONES
        // ==========================================
        if (!mes || !anio) {
            return res.status(400).json({
                ok: false,
                msg: "El mes y año son obligatorios"
            });
        }

        const mesNum = parseInt(mes);
        const anioNum = parseInt(anio);

        if (isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
            return res.status(400).json({
                ok: false,
                msg: "Mes inválido. Debe ser del 1 al 12"
            });
        }

        if (isNaN(anioNum) || anioNum < 2000 || anioNum > 2100) {
            return res.status(400).json({
                ok: false,
                msg: "Año inválido"
            });
        }

        // ==========================================
        // CALCULAR RANGO DEL MES (UTC-3)
        // ==========================================
        const fechaInicio = new Date(Date.UTC(anioNum, mesNum - 1, 1, 3, 0, 0));
        const fechaFin = new Date(Date.UTC(anioNum, mesNum, 1, 2, 59, 59, 999));

        // ==========================================
        // FUNCIÓN PARA CALCULAR RECARGOS
        // ==========================================
        const calcularTotalRecargos = (recargos) => {
            if (!recargos || recargos.length === 0) return 0;
            return recargos.reduce((sum, r) => sum + (r.monto || 0), 0);
        };

        // ==========================================
        // AGREGACIÓN PRINCIPAL
        // ==========================================
        const resultado = await Venta.aggregate([
            // 1. Solo ventas activas con cuotas
            {
                $match: {
                    estado: true,
                    cuotas: { $exists: true, $not: { $size: 0 } }
                }
            },

            // 2. Desarmar array de cuotas
            {
                $unwind: '$cuotas'
            },

            // 3. Filtrar solo las cuotas del mes (por fecha de cobro)
            {
                $match: {
                    'cuotas.fechaCobro': { $gte: fechaInicio, $lte: fechaFin }
                }
            },

            // 4. Calcular total de recargos de la cuota
            {
                $addFields: {
                    'cuotas.totalRecargos': {
                        $sum: '$cuotas.recargos.monto'
                    },
                    'cuotas.cantidadRecargos': {
                        $size: { $ifNull: ['$cuotas.recargos', []] }
                    },
                    'cuotas.totalCuota': {
                        $add: [
                            '$cuotas.montoCuota',
                            { $sum: '$cuotas.recargos.monto' }
                        ]
                    },
                    'cuotas.saldoPendiente': {
                        $subtract: [
                            {
                                $add: [
                                    '$cuotas.montoCuota',
                                    { $sum: '$cuotas.recargos.monto' }
                                ]
                            },
                            { $ifNull: ['$cuotas.montoPagado', 0] }
                        ]
                    }
                }
            },

            // 5. Proyectar datos finales
            {
                $project: {
                    _id: 0,
                    idVenta: '$_id',
                    cliente: {
                        nombre: '$cliente.nombre',
                        apellido: '$cliente.apellido',
                        dni: '$cliente.dni'
                    },
                    localidad: 1,
                    tipoVenta: 1,
                    producto: '$producto.nombre',
                    numeroCuota: '$cuotas.numeroCuota',
                    montoCuota: '$cuotas.montoCuota',
                    // Recargos
                    recargos: '$cuotas.recargos',
                    totalRecargos: '$cuotas.totalRecargos',
                    cantidadRecargos: '$cuotas.cantidadRecargos',
                    // Montos reales
                    totalCuota: '$cuotas.totalCuota',
                    montoPagado: { $ifNull: ['$cuotas.montoPagado', 0] },
                    saldoPendiente: '$cuotas.saldoPendiente',
                    estadoCuota: '$cuotas.estado_cuota',
                    fechaCobro: '$cuotas.fechaCobro',
                    fechaCobrada: '$cuotas.fechaCobrada',
                    metodoPago: '$cuotas.metodoPago',
                    cobrador: '$cuotas.cobrador.nombre',
                    notas: '$cuotas.notas'
                }
            },

            // 6. Ordenar por fecha de cobro
            {
                $sort: {
                    fechaCobro: 1
                }
            }
        ]);

        // ==========================================
        // VERIFICAR SI HAY RESULTADOS
        // ==========================================
        if (resultado.length === 0) {
            return res.status(200).json({
                ok: true,
                msg: `No hay cuotas para el período ${mesNum}/${anioNum}`,
                totalCuotas: 0,
                resumen: {
                    totalCuotas: 0,
                    totalCapital: 0,
                    totalRecargos: 0,
                    totalCobrado: 0,
                    totalPendiente: 0,
                    cuotasPagadas: 0,
                    cuotasPagoParcial: 0,
                    cuotasPendientes: 0,
                    cuotasNoPagadas: 0,
                    cuotasConRecargos: 0,
                    totalRecargosPendientes: 0
                },
                cuotas: []
            });
        }

        // ==========================================
        // CALCULAR RESUMEN (CON RECARGOS)
        // ==========================================
        const resumen = {
            totalCuotas: resultado.length,
            totalCapital: resultado.reduce((sum, c) => sum + c.montoCuota, 0),
            totalRecargos: resultado.reduce((sum, c) => sum + c.totalRecargos, 0),
            totalCobrado: resultado.reduce((sum, c) => sum + c.montoPagado, 0),
            totalPendiente: resultado.reduce((sum, c) => sum + c.saldoPendiente, 0),

            // Estado de cuotas
            cuotasPagadas: resultado.filter(c => c.estadoCuota === 'pagada').length,
            cuotasPagoParcial: resultado.filter(c => c.estadoCuota === 'pago parcial').length,
            cuotasPendientes: resultado.filter(c => c.estadoCuota === 'pendiente').length,
            cuotasNoPagadas: resultado.filter(c => c.estadoCuota === 'no pagada').length,

            // Información de recargos
            cuotasConRecargos: resultado.filter(c => c.cantidadRecargos > 0).length,
            totalRecargosPendientes: resultado
                .filter(c => c.estadoCuota !== 'pagada')
                .reduce((sum, c) => sum + c.totalRecargos, 0),

            // Eficiencia de cobranza
            eficienciaCobranza: resultado.length > 0
                ? ((resultado.filter(c => c.estadoCuota === 'pagada').length / resultado.length) * 100).toFixed(2)
                : 0,

            // Monto promedio con recargos
            promedioCuota: resultado.length > 0
                ? (resultado.reduce((sum, c) => sum + c.totalCuota, 0) / resultado.length).toFixed(2)
                : 0
        };

        // ==========================================
        // RESPONDER
        // ==========================================
        res.status(200).json({
            ok: true,
            msg: `Reporte de cobranza ${mesNum}/${anioNum}`,
            periodo: {
                mes: mesNum,
                anio: anioNum,
                fechaInicio,
                fechaFin
            },
            resumen,
            cuotas: resultado
        });

    } catch (error) {
        console.error('Error en reporte de cobranza mensual:', error);
        res.status(500).json({
            ok: false,
            msg: "Error al generar el reporte",
            error: error.message
        });
    }
};

const historialCuotasPorVenta = async (req, res) => {
    try {
        // ==========================================
        // AGREGACIÓN PRINCIPAL
        // ==========================================
        const resultado = await Venta.aggregate([
            // 1. Solo ventas activas que tengan cuotas
            {
                $match: {
                    estado: true,
                    frecuenciaCuota: { $ne: null }
                }
            },

            // 2. Desarmar array de cuotas
            {
                $unwind: '$cuotas'
            },

            // 3. Calcular total de recargos por cuota
            {
                $addFields: {
                    'cuotas.totalRecargos': {
                        $sum: '$cuotas.recargos.monto'
                    },
                    'cuotas.cantidadRecargos': {
                        $size: { $ifNull: ['$cuotas.recargos', []] }
                    },
                    'cuotas.totalCuota': {
                        $add: [
                            '$cuotas.montoCuota',
                            { $sum: '$cuotas.recargos.monto' }
                        ]
                    },
                    'cuotas.saldoPendiente': {
                        $subtract: [
                            {
                                $add: [
                                    '$cuotas.montoCuota',
                                    { $sum: '$cuotas.recargos.monto' }
                                ]
                            },
                            { $ifNull: ['$cuotas.montoPagado', 0] }
                        ]
                    }
                }
            },

            // 4. Agrupar por venta para armar el historial
            {
                $group: {
                    _id: '$_id',
                    cliente: { $first: '$cliente' },
                    localidad: { $first: '$localidad' },
                    tipoVenta: { $first: '$tipoVenta' },
                    frecuenciaCuota: { $first: '$frecuenciaCuota' },
                    vendedor: { $first: '$vendedor' },
                    producto: { $first: '$producto.nombre' },
                    modelo: { $first: '$producto.modelo' },
                    montoTotal: { $first: '$montoTotal' },
                    conducta_pago: { $first: '$conducta_pago' },
                    totalCuotas: { $sum: 1 },

                    // Contadores por estado
                    cuotasPagadas: {
                        $sum: {
                            $cond: [{ $eq: ['$cuotas.estado_cuota', 'pagada'] }, 1, 0]
                        }
                    },
                    cuotasPagoParcial: {
                        $sum: {
                            $cond: [{ $eq: ['$cuotas.estado_cuota', 'pago parcial'] }, 1, 0]
                        }
                    },
                    cuotasPendientes: {
                        $sum: {
                            $cond: [{ $eq: ['$cuotas.estado_cuota', 'pendiente'] }, 1, 0]
                        }
                    },
                    cuotasNoPagadas: {
                        $sum: {
                            $cond: [{ $eq: ['$cuotas.estado_cuota', 'no pagada'] }, 1, 0]
                        }
                    },

                    // Montos de capital
                    totalCapital: { $sum: '$cuotas.montoCuota' },

                    // Recargos totales generados en la venta
                    totalRecargosGenerados: { $sum: '$cuotas.totalRecargos' },

                    // Recargos cobrados (de cuotas pagadas o parciales)
                    totalRecargosCobrados: {
                        $sum: {
                            $cond: [
                                { $in: ['$cuotas.estado_cuota', ['pagada', 'pago parcial']] },
                                { $min: ['$cuotas.totalRecargos', { $ifNull: ['$cuotas.montoPagado', 0] }] },
                                0
                            ]
                        }
                    },

                    // Recargos pendientes
                    totalRecargosPendientes: {
                        $sum: {
                            $subtract: [
                                '$cuotas.totalRecargos',
                                {
                                    $cond: [
                                        { $in: ['$cuotas.estado_cuota', ['pagada', 'pago parcial']] },
                                        { $min: ['$cuotas.totalRecargos', { $ifNull: ['$cuotas.montoPagado', 0] }] },
                                        0
                                    ]
                                }
                            ]
                        }
                    },

                    // Monto pagado real (incluye recargos)
                    montoPagado: {
                        $sum: { $ifNull: ['$cuotas.montoPagado', 0] }
                    },

                    // Total real de la venta (capital + recargos)
                    totalReal: {
                        $sum: '$cuotas.totalCuota'
                    },

                    // Saldo pendiente real
                    saldoPendienteReal: {
                        $sum: '$cuotas.saldoPendiente'
                    },

                    // Conteo de cuotas con recargos
                    cuotasConRecargos: {
                        $sum: {
                            $cond: [
                                { $gt: ['$cuotas.totalRecargos', 0] },
                                1,
                                0
                            ]
                        }
                    },

                    // Detalle de cuotas con recargos
                    detalleCuotas: {
                        $push: {
                            numeroCuota: '$cuotas.numeroCuota',
                            montoCuota: '$cuotas.montoCuota',
                            // Recargos de la cuota
                            recargos: '$cuotas.recargos',
                            totalRecargos: '$cuotas.totalRecargos',
                            cantidadRecargos: '$cuotas.cantidadRecargos',
                            totalCuota: '$cuotas.totalCuota',
                            montoPagado: { $ifNull: ['$cuotas.montoPagado', 0] },
                            saldoPendiente: '$cuotas.saldoPendiente',
                            estadoCuota: '$cuotas.estado_cuota',
                            fechaCobro: '$cuotas.fechaCobro',
                            fechaCobrada: '$cuotas.fechaCobrada',
                            metodoPago: '$cuotas.metodoPago',
                            cobrador: '$cuotas.cobrador.nombre'
                        }
                    }
                }
            },

            // 5. Ordenar detalle de cuotas por número
            {
                $addFields: {
                    detalleCuotas: {
                        $sortArray: {
                            input: '$detalleCuotas',
                            sortBy: { numeroCuota: 1 }
                        }
                    }
                }
            },

            // 6. Calcular porcentajes y métricas
            {
                $addFields: {
                    // Porcentaje de cobranza (sobre total real)
                    porcentajeCobrado: {
                        $cond: [
                            { $gt: ['$totalReal', 0] },
                            { $round: [{ $multiply: [{ $divide: ['$montoPagado', '$totalReal'] }, 100] }, 2] },
                            0
                        ]
                    },
                    // Porcentaje de recargos cobrados
                    porcentajeRecargosCobrados: {
                        $cond: [
                            { $gt: ['$totalRecargosGenerados', 0] },
                            { $round: [{ $multiply: [{ $divide: ['$totalRecargosCobrados', '$totalRecargosGenerados'] }, 100] }, 2] },
                            0
                        ]
                    },
                    // Eficiencia de cobranza (cuotas pagadas vs total)
                    eficienciaCobranza: {
                        $cond: [
                            { $gt: ['$totalCuotas', 0] },
                            { $round: [{ $multiply: [{ $divide: ['$cuotasPagadas', '$totalCuotas'] }, 100] }, 2] },
                            0
                        ]
                    }
                }
            },

            // 7. Ordenar por conducta de pago y cliente
            {
                $sort: {
                    conducta_pago: 1,
                    'cliente.apellido': 1
                }
            },

            // 8. Proyectar final
            {
                $project: {
                    _id: 0,
                    idVenta: '$_id',
                    cliente: 1,
                    localidad: 1,
                    tipoVenta: 1,
                    frecuenciaCuota: 1,
                    vendedor: 1,
                    producto: 1,
                    modelo: 1,
                    montoTotal: 1,
                    conducta_pago: 1,
                    totalCuotas: 1,

                    // Estados
                    cuotasPagadas: 1,
                    cuotasPagoParcial: 1,
                    cuotasPendientes: 1,
                    cuotasNoPagadas: 1,
                    cuotasConRecargos: 1,

                    // Montos
                    totalCapital: 1,
                    totalRecargosGenerados: 1,
                    totalRecargosCobrados: 1,
                    totalRecargosPendientes: 1,
                    montoPagado: 1,
                    totalReal: 1,
                    saldoPendienteReal: 1,

                    // Métricas
                    porcentajeCobrado: 1,
                    porcentajeRecargosCobrados: 1,
                    eficienciaCobranza: 1,

                    // Detalle
                    detalleCuotas: 1
                }
            }
        ]);

        // ==========================================
        // VERIFICAR RESULTADOS
        // ==========================================
        if (resultado.length === 0) {
            return res.status(200).json({
                ok: true,
                msg: "No hay ventas con cuotas registradas",
                totalVentas: 0,
                totalesGenerales: {
                    totalVentas: 0,
                    totalCuotas: 0,
                    totalCuotasPagadas: 0,
                    totalCuotasPagoParcial: 0,
                    totalCuotasPendientes: 0,
                    totalCuotasNoPagadas: 0,
                    totalCuotasConRecargos: 0,
                    totalCapital: 0,
                    totalRecargosGenerados: 0,
                    totalRecargosCobrados: 0,
                    totalRecargosPendientes: 0,
                    totalPagado: 0,
                    totalReal: 0,
                    totalPendienteReal: 0,
                    promedioRecargosPorVenta: 0,
                    eficienciaGeneral: 0
                },
                ventas: []
            });
        }

        // ==========================================
        // CALCULAR TOTALES GENERALES
        // ==========================================
        const totalesGenerales = resultado.reduce((acc, venta) => {
            acc.totalVentas += 1;
            acc.totalCuotas += venta.totalCuotas;
            acc.totalCuotasPagadas += venta.cuotasPagadas;
            acc.totalCuotasPagoParcial += venta.cuotasPagoParcial;
            acc.totalCuotasPendientes += venta.cuotasPendientes;
            acc.totalCuotasNoPagadas += venta.cuotasNoPagadas;
            acc.totalCuotasConRecargos += venta.cuotasConRecargos || 0;
            acc.totalCapital += venta.totalCapital || 0;
            acc.totalRecargosGenerados += venta.totalRecargosGenerados || 0;
            acc.totalRecargosCobrados += venta.totalRecargosCobrados || 0;
            acc.totalRecargosPendientes += venta.totalRecargosPendientes || 0;
            acc.totalPagado += venta.montoPagado || 0;
            acc.totalReal += venta.totalReal || 0;
            acc.totalPendienteReal += venta.saldoPendienteReal || 0;
            return acc;
        }, {
            totalVentas: 0,
            totalCuotas: 0,
            totalCuotasPagadas: 0,
            totalCuotasPagoParcial: 0,
            totalCuotasPendientes: 0,
            totalCuotasNoPagadas: 0,
            totalCuotasConRecargos: 0,
            totalCapital: 0,
            totalRecargosGenerados: 0,
            totalRecargosCobrados: 0,
            totalRecargosPendientes: 0,
            totalPagado: 0,
            totalReal: 0,
            totalPendienteReal: 0
        });

        // Calcular métricas generales
        totalesGenerales.promedioRecargosPorVenta = totalesGenerales.totalVentas > 0
            ? (totalesGenerales.totalRecargosGenerados / totalesGenerales.totalVentas).toFixed(2)
            : 0;

        totalesGenerales.eficienciaGeneral = totalesGenerales.totalCuotas > 0
            ? ((totalesGenerales.totalCuotasPagadas / totalesGenerales.totalCuotas) * 100).toFixed(2)
            : 0;

        totalesGenerales.porcentajeCobradoGeneral = totalesGenerales.totalReal > 0
            ? ((totalesGenerales.totalPagado / totalesGenerales.totalReal) * 100).toFixed(2)
            : 0;

        // ==========================================
        // RESPONDER
        // ==========================================
        res.status(200).json({
            ok: true,
            msg: "Historial de cuotas por venta",
            totalesGenerales,
            ventas: resultado
        });

    } catch (error) {
        console.error('Error en historial de cuotas:', error);
        res.status(500).json({
            ok: false,
            msg: "Error al generar el historial de cuotas",
            error: error.message
        });
    }
};

const reporteEquiposCanjeados = async (req, res) => {
    try {
        const resultado = await EqupoCanjes.aggregate([
            // 1. Solo equipos activos
            {
                $match: {
                    activo: true
                }
            },

            // 2. Traer datos de la venta de origen
            {
                $lookup: {
                    from: 'ventas',
                    localField: 'ventaOrigen',
                    foreignField: '_id',
                    as: 'venta'
                }
            },

            // 3. Desarmar el array de la venta (viene como array de 1 elemento)
            {
                $unwind: {
                    path: '$venta',
                    preserveNullAndEmptyArrays: true
                }
            },

            // 4. Proyectar los campos que necesito
            {
                $project: {
                    _id: 0,
                    idEquipo: '$_id',
                    nombre: 1,
                    modelo: 1,
                    imei: 1,
                    color: 1,
                    bateria: 1,
                    estado: 1,
                    localidad: 1, // 🆕 AGREGAR ESTA LÍNEA
                    valorTasado: 1,
                    fechaRecepcion: 1,
                    notas: 1,
                    venta: {
                        idVenta: '$venta._id',
                        cliente: {
                            nombre: '$venta.cliente.nombre',
                            apellido: '$venta.cliente.apellido',
                            dni: '$venta.cliente.dni'
                        },
                        localidad: '$venta.localidad',
                        tipoVenta: '$venta.tipoVenta',
                        vendedor: '$venta.vendedor',
                        productoEntregado: {
                            nombre: '$venta.producto.nombre',
                            modelo: '$venta.producto.modelo',
                            valor: '$venta.producto.valor'
                        }
                    }
                }
            },

            // 5. Ordenar por fecha de recepción (más recientes primero)
            {
                $sort: {
                    fechaRecepcion: -1
                }
            }
        ]);

        if (resultado.length === 0) {
            return res.status(200).json({
                ok: true,
                msg: "No hay equipos canjeados registrados",
                totalEquipos: 0,
                equipos: []
            });
        }

        // Totales generales
        const totalesGenerales = {
            totalEquipos: resultado.length,
            valorTotalTasado: resultado.reduce((sum, eq) => sum + eq.valorTasado, 0),
            valorPromedio: Math.round(resultado.reduce((sum, eq) => sum + eq.valorTasado, 0) / resultado.length),
            porEstado: {
                bueno: resultado.filter(eq => eq.estado === 'bueno').length,
                regular: resultado.filter(eq => eq.estado === 'regular').length,
                malo: resultado.filter(eq => eq.estado === 'malo').length,
                excelente: resultado.filter(eq => eq.estado === 'excelente').length
            }
        };

        res.status(200).json({
            ok: true,
            msg: "Reporte de equipos canjeados",
            totalesGenerales,
            equipos: resultado
        });

    } catch (error) {
        console.error('Error en reporte de equipos canjeados:', error);
        res.status(500).json({
            ok: false,
            msg: "Error al generar el reporte de equipos canjeados"
        });
    }
};

// ==========================================
// 📋 LISTAR EQUIPOS DISPONIBLES (Stock + Canje)
// ==========================================
const listarEquiposDisponibles = async (req, res) => {
    try {
        const {
            localidad,
            nombre,
            modelo,
            imei,
            estado,
            origen,     // 'stock', 'canje', o vacío para todos
            pagina = 1,
            limite = 20
        } = req.query;

        // ==========================================
        // PAGINACIÓN
        // ==========================================
        const skip = (parseInt(pagina) - 1) * parseInt(limite);
        const limit = parseInt(limite);

        // ==========================================
        // CONSTRUIR FILTROS BASE
        // ==========================================
        const filtrosStock = { disponible: true };
        const filtrosCanje = { activo: true };

        // 👉 Filtro por localidad
        if (localidad) {
            const localidadNormalizada = localidad.toLowerCase().trim();
            filtrosStock.localidad = localidadNormalizada;
            filtrosCanje.localidad = localidadNormalizada;
        }

        // 👉 Filtro por nombre (búsqueda parcial)
        if (nombre) {
            filtrosStock.nombre = { $regex: nombre, $options: 'i' };
            filtrosCanje.nombre = { $regex: nombre, $options: 'i' };
        }

        // 👉 Filtro por modelo
        if (modelo) {
            filtrosStock.modelo = { $regex: modelo, $options: 'i' };
            filtrosCanje.modelo = { $regex: modelo, $options: 'i' };
        }

        // 👉 Filtro por IMEI
        if (imei) {
            filtrosStock.imei = { $regex: imei, $options: 'i' };
            filtrosCanje.imei = { $regex: imei, $options: 'i' };
        }

        // 👉 Filtro por estado
        if (estado) {
            filtrosStock.estado = estado;
            filtrosCanje.estado = estado;
        }

        // ==========================================
        // CONSULTAR SEGÚN ORIGEN
        // ==========================================
        let equiposStock = [];
        let equiposCanje = [];
        let totalStock = 0;
        let totalCanje = 0;

        // Si no se especifica origen o es 'stock'
        if (!origen || origen === 'stock') {
            const [stockData, totalStockData] = await Promise.all([
                EquipoStock.find(filtrosStock)
                    .sort({ fechaIngreso: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                EquipoStock.countDocuments(filtrosStock)
            ]);

            equiposStock = stockData;
            totalStock = totalStockData;
        }

        // Si no se especifica origen o es 'canje'
        if (!origen || origen === 'canje') {
            const [canjeData, totalCanjeData] = await Promise.all([
                EqupoCanjes.find(filtrosCanje)
                    .sort({ fechaRecepcion: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                EqupoCanjes.countDocuments(filtrosCanje)
            ]);

            equiposCanje = canjeData;
            totalCanje = totalCanjeData;
        }

        // ==========================================
        // FORMATEAR RESPUESTA
        // ==========================================
        const equiposFormateados = [
            // Stock
            ...equiposStock.map(equipo => ({
                _id: equipo._id,
                origen: 'stock',
                nombre: equipo.nombre,
                modelo: equipo.modelo || '',
                imei: equipo.imei || '',
                color: equipo.color || '',
                bateria: equipo.bateria || '',
                estado: equipo.estado,
                localidad: equipo.localidad || '',
                // Datos específicos de stock
                precioVenta: equipo.precioVenta,
                precioCompra: equipo.precioCompra,
                disponible: equipo.disponible,
                fechaIngreso: equipo.fechaIngreso
            })),
            // Canje
            ...equiposCanje.map(equipo => ({
                _id: equipo._id,
                origen: 'canje',
                nombre: equipo.nombre,
                modelo: equipo.modelo || '',
                imei: equipo.imei || '',
                color: equipo.color || '',
                bateria: equipo.bateria || '',
                estado: equipo.estado,
                localidad: equipo.localidad || '',
                // Datos específicos de canje
                valorTasado: equipo.valorTasado,
                activo: equipo.activo,
                fechaRecepcion: equipo.fechaRecepcion
            }))
        ];

        // Ordenar por fecha (más recientes primero)
        equiposFormateados.sort((a, b) => {
            const fechaA = a.fechaIngreso || a.fechaRecepcion;
            const fechaB = b.fechaIngreso || b.fechaRecepcion;
            return new Date(fechaB) - new Date(fechaA);
        });

        const total = totalStock + totalCanje;

        return res.status(200).json({
            ok: true,
            message: 'Equipos disponibles encontrados',
            data: {
                equipos: equiposFormateados,
                resumen: {
                    total,
                    totalStock,
                    totalCanje
                },
                paginacion: {
                    total,
                    pagina: parseInt(pagina),
                    limite: limit,
                    totalPaginas: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Error al listar equipos disponibles:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al listar equipos disponibles: ${error.message}`
        });
    }
};

const listarEquiposDisponibles2 = async (req, res) => {
    try {
        const {
            localidad,
            nombre,
            modelo,
            capacidad,
            imei,
            estado,
            origen,     // 'stock', 'canje', o vacío para todos
            pagina = 1,
            limite = 50
        } = req.query;

        // ==========================================
        // PAGINACIÓN
        // ==========================================
        const skip = (parseInt(pagina) - 1) * parseInt(limite);
        const limit = parseInt(limite);

        // ==========================================
        // CONSTRUIR FILTROS BASE
        // ==========================================
        const filtros = { disponible: true };  // 👉 Solo disponibles

        // 👉 Filtro por origen (si se especifica)
        if (origen && origen !== '') {
            filtros.origen = origen;
        }

        // 👉 Filtro por localidad
        if (localidad) {
            filtros.localidad = localidad.toLowerCase().trim();
        }

        // 👉 Filtro por nombre (búsqueda parcial)
        if (nombre) {
            filtros.nombre = { $regex: nombre, $options: 'i' };
        }

        // 👉 Filtro por modelo
        if (modelo) {
            filtros.modelo = { $regex: modelo, $options: 'i' };
        }

        // 👉 Filtro por capacidad
        if (capacidad) {
            filtros.capacidad = { $regex: capacidad, $options: 'i' };
        }

        // 👉 Filtro por IMEI
        if (imei) {
            filtros.imei = { $regex: imei, $options: 'i' };
        }

        // 👉 Filtro por estado
        if (estado) {
            filtros.estado = estado;
        }

        // ==========================================
        // CONSULTAR
        // ==========================================
        const [equipos, total] = await Promise.all([
            Equipos.find(filtros)
                .sort({ fechaIngreso: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Equipos.countDocuments(filtros)
        ]);

     

        // ==========================================
        // CALCULAR RESUMEN (por origen)
        // ==========================================
        const resumen = await Equipos.aggregate([
            { $match: { disponible: true } },
            {
                $group: {
                    _id: '$origen',
                    cantidad: { $sum: 1 },
                    totalVenta: { $sum: '$precioVenta' },
                    totalTasado: { $sum: '$valorTasado' }
                }
            }
        ]);



        const resumenStock = resumen.find(r => r._id === 'stock') || { cantidad: 0, totalVenta: 0 };
        const resumenCanje = resumen.find(r => r._id === 'canje') || { cantidad: 0, totalTasado: 0 };

        // ==========================================
        // FORMATEAR RESPUESTA
        // ==========================================
        const equiposFormateados = equipos.map(equipo => ({
            _id: equipo._id,
            origen: equipo.origen,
            nombre: equipo.nombre,
            modelo: equipo.modelo || '',
            capacidad: equipo.capacidad || '',
            imei: equipo.imei || '',
            color: equipo.color || '',
            bateria: equipo.bateria || '',
            estado: equipo.estado,
            localidad: equipo.localidad || '',
            // Datos según origen
            precioVenta: equipo.origen === 'stock' ? equipo.precioVenta : 0,
            precioCompra: equipo.origen === 'stock' ? equipo.precioCompra : 0,
            valorTasado: equipo.origen === 'canje' ? equipo.valorTasado : 0,
            disponible: equipo.disponible,
            fechaIngreso: equipo.fechaIngreso,
            fechaRecepcion: equipo.fechaRecepcion
        }));

        // ==========================================
        // PAGINACIÓN
        // ==========================================
        const totalPaginas = Math.ceil(total / limit);
        const hayMas = parseInt(pagina) < totalPaginas;
        const restantes = Math.max(0, total - (parseInt(pagina) * limit));

        return res.status(200).json({
            ok: true,
            message: 'Equipos disponibles encontrados',
            data: {
                equipos: equiposFormateados,
                resumen: {
                    total,
                    totalStock: resumenStock.cantidad,
                    totalCanje: resumenCanje.cantidad,
                    valorStock: resumenStock.totalVenta,
                    valorCanje: resumenCanje.totalTasado
                },
                paginacion: {
                    total,
                    pagina: parseInt(pagina),
                    limite: limit,
                    totalPaginas,
                    hayMas,
                    restantes
                }
            }
        });

    } catch (error) {
        console.error('Error al listar equipos disponibles:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al listar equipos disponibles: ${error.message}`
        });
    }
};

const listarVentasContado = async (req, res) => {
    try {
        const {
            dni,
            nombre,
            fechaDesde,
            fechaHasta,
            localidad,
            tipoVenta,
            vendedor,
            pagina = 1,
            limite = 20
        } = req.query;

        // ==========================================
        // CONSTRUIR FILTROS
        // ==========================================
        const filtros = {
            estado: true,
            // 👉 Solo ventas SIN cuotas
            $or: [
                { cuotas: { $exists: false } },  // No tiene el campo cuotas
                { cuotas: { $size: 0 } }          // O tiene array vacío
            ]
        };

        // Filtro por DNI
        if (dni) {
            filtros['cliente.dni'] = dni.trim();
        }

        // Filtro por nombre (búsqueda parcial)
        if (nombre) {
            filtros['cliente.nombre'] = { $regex: nombre.trim(), $options: 'i' };
        }

        // Filtro por localidad
        if (localidad) {
            filtros.localidad = localidad.toLowerCase().trim();
        }

        // Filtro por tipo de venta
        if (tipoVenta) {
            filtros.tipoVenta = tipoVenta;
        }

        // Filtro por vendedor
        if (vendedor) {
            filtros.vendedor = { $regex: vendedor, $options: 'i' };
        }

        // ==========================================
        // FILTRO POR FECHA DE VENTA
        // ==========================================
        if (fechaDesde || fechaHasta) {
            filtros.fechaRealizada = {};
            if (fechaDesde) {
                filtros.fechaRealizada.$gte = new Date(fechaDesde + 'T00:00:00-03:00');
            }
            if (fechaHasta) {
                filtros.fechaRealizada.$lte = new Date(fechaHasta + 'T23:59:59-03:00');
            }
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
                .select('cliente producto localidad tipoVenta fechaRealizada vendedor montoTotal montoPagado pagos notas estado')
                .sort({ fechaRealizada: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Venta.countDocuments(filtros)
        ]);

        // ==========================================
        // FORMATEAR RESPUESTA
        // ==========================================
        const ventasFormateadas = ventas.map(venta => {
            // Calcular monto pendiente
            const montoPendiente = (venta.montoTotal || 0) - (venta.montoPagado || 0);

            // Total de pagos realizados
            const totalPagos = (venta.pagos || []).reduce((sum, p) => sum + p.monto, 0);

            return {
                _id: venta._id,
                cliente: venta.cliente,
                producto: venta.producto,
                localidad: venta.localidad,
                tipoVenta: venta.tipoVenta,
                fechaRealizada: venta.fechaRealizada,
                vendedor: venta.vendedor || '',
                montoTotal: venta.montoTotal,
                montoPagado: venta.montoPagado || 0,
                montoPendiente,
                totalPagos,
                cantidadPagos: (venta.pagos || []).length,
                pagos: (venta.pagos || []).map(p => ({
                    monto: p.monto,
                    metodo: p.metodo,
                    fecha: p.fecha
                })),
                notas: (venta.notas || []).map(n => ({
                    texto: n.texto,
                    tipo: n.tipo,
                    fecha: n.fecha,
                    usuario: n.usuario?.nombre || ''
                })),
                estado: venta.estado
            };
        });

        return res.status(200).json({
            ok: true,
            message: 'Ventas de contado encontradas',
            data: ventasFormateadas,
            paginacion: {
                total,
                pagina: parseInt(pagina),
                limite: limit,
                paginas: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Error al listar ventas de contado:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al listar ventas de contado: ${error.message}`
        });
    }
};

//para el panel de reportes de 5 solapas


// ==========================================
// 📊 RESUMEN GENERAL PARA DASHBOARD
// ==========================================
const resumenGeneral = async (req, res) => {
    try {
        // ==========================================
        // 1. VENTAS TOTALES Y POR TIPO
        // ==========================================
        const ventasTotales = await Venta.countDocuments({ estado: true });

        const ventasPorTipo = await Venta.aggregate([
            { $match: { estado: true } },
            {
                $group: {
                    _id: '$tipoVenta',
                    cantidad: { $sum: 1 }
                }
            }
        ]);

        // Formatear ventas por tipo
        const ventasTipo = {
            contado: 0,
            plan_canje: 0,
            sistema1: 0,
            sistema2: 0
        };

        ventasPorTipo.forEach(v => {
            if (ventasTipo.hasOwnProperty(v._id)) {
                ventasTipo[v._id] = v.cantidad;
            }
        });

        // ==========================================
        // 2. MONTOS PAGADOS
        // ==========================================
        const montosPagados = await Venta.aggregate([
            { $match: { estado: true } },
            {
                $group: {
                    _id: null,
                    totalMontoPagadoVentas: { $sum: '$montoPagado' },
                    totalMontoTotalVentas: { $sum: '$montoTotal' }
                }
            }
        ]);

        const totalesMontos = montosPagados[0] || { totalMontoPagadoVentas: 0, totalMontoTotalVentas: 0 };

        // Suma de cuotas pagadas (estado 'pagada')
        const cuotasPagadas = await Venta.aggregate([
            { $match: { estado: true } },
            { $unwind: '$cuotas' },
            { $match: { 'cuotas.estado_cuota': 'pagada' } },
            {
                $group: {
                    _id: null,
                    totalMontoCuotasPagadas: { $sum: '$cuotas.montoPagado' },
                    cantidadCuotasPagadas: { $sum: 1 }
                }
            }
        ]);

        const totalesCuotasPagadas = cuotasPagadas[0] || { totalMontoCuotasPagadas: 0, cantidadCuotasPagadas: 0 };

        // ==========================================
        // 3. MONTOS POR MÉTODO DE PAGO (separados)
        // ==========================================
        // Métodos de pagos iniciales (ventas)
        const metodosPagosIniciales = await Venta.aggregate([
            { $match: { estado: true } },
            { $unwind: '$pagos' },
            {
                $group: {
                    _id: '$pagos.metodo',
                    total: { $sum: '$pagos.monto' }
                }
            }
        ]);

        // Métodos de pago de cuotas
        const metodosPagosCuotas = await Venta.aggregate([
            { $match: { estado: true } },
            { $unwind: '$cuotas' },
            { $match: { 'cuotas.estado_cuota': 'pagada' } },
            {
                $group: {
                    _id: '$cuotas.metodoPago',
                    total: { $sum: '$cuotas.montoPagado' }
                }
            }
        ]);

        // Combinar métodos de pago
        const metodosCombinados = {};

        metodosPagosIniciales.forEach(m => {
            if (m._id && m._id !== null) {
                metodosCombinados[m._id] = (metodosCombinados[m._id] || 0) + m.total;
            }
        });

        metodosPagosCuotas.forEach(m => {
            if (m._id && m._id !== null) {
                metodosCombinados[m._id] = (metodosCombinados[m._id] || 0) + m.total;
            }
        });

        // ==========================================
        // 4. CUOTAS POR COBRAR (solo pendientes)
        // ==========================================
        const cuotasPendientes = await Venta.aggregate([
            { $match: { estado: true } },
            { $unwind: '$cuotas' },
            { $match: { 'cuotas.estado_cuota': 'pendiente' } },
            {
                $group: {
                    _id: null,
                    totalMontoPendiente: { $sum: '$cuotas.montoCuota' },
                    cantidadCuotasPendientes: { $sum: 1 }
                }
            }
        ]);

        const totalesCuotasPendientes = cuotasPendientes[0] || { totalMontoPendiente: 0, cantidadCuotasPendientes: 0 };

        // ==========================================
        // 5. EQUIPOS VENDIDOS (disponible: false)
        // ==========================================
        const equiposVendidos = await Equipos.aggregate([
            { $match: { disponible: false } },
            {
                $group: {
                    _id: '$origen',
                    cantidad: { $sum: 1 },
                    totalPrecioCompra: {
                        $sum: { $cond: [{ $eq: ['$origen', 'stock'] }, '$precioCompra', 0] }
                    },
                    totalValorTasado: {
                        $sum: { $cond: [{ $eq: ['$origen', 'canje'] }, '$valorTasado', 0] }
                    }
                }
            }
        ]);

        const vendidosStock = equiposVendidos.find(e => e._id === 'stock') || { cantidad: 0, totalPrecioCompra: 0 };
        const vendidosCanje = equiposVendidos.find(e => e._id === 'canje') || { cantidad: 0, totalValorTasado: 0 };

        // Cantidad total de equipos en stock (todos)
        const totalEquiposStock = await Equipos.countDocuments();

        // ==========================================
        // 6. TOTAL DE GASTOS GENERALES
        // ==========================================
        const gastosTotales = await Gastos.aggregate([
            {
                $group: {
                    _id: null,
                    totalGastos: { $sum: '$Monto_gasto' }
                }
            }
        ]);

        const totalGastos = gastosTotales[0]?.totalGastos || 0;

        // ==========================================
        // 7. CALCULAR TOTAL GENERAL PAGADO (ventas + cuotas)
        // ==========================================
        const totalPagadoGeneral = totalesMontos.totalMontoPagadoVentas + totalesCuotasPagadas.totalMontoCuotasPagadas;

        // ==========================================
        // RESPUESTA
        // ==========================================
        return res.status(200).json({
            ok: true,
            message: 'Resumen general obtenido exitosamente',
            data: {
                // Ventas
                ventas: {
                    totalVentas: ventasTotales,
                    porTipo: {
                        contado: ventasTipo.contado,
                        plan_canje: ventasTipo.plan_canje,
                        sistema1: ventasTipo.sistema1,
                        sistema2: ventasTipo.sistema2
                    }
                },

                // Montos
                montos: {
                    totalMontoPagadoVentas: totalesMontos.totalMontoPagadoVentas,
                    totalMontoTotalVentas: totalesMontos.totalMontoTotalVentas,
                    totalMontoCuotasPagadas: totalesCuotasPagadas.totalMontoCuotasPagadas,
                    totalPagadoGeneral,
                    porMetodoPago: metodosCombinados
                },

                // Cuotas
                cuotas: {
                    porCobrarMonto: totalesCuotasPendientes.totalMontoPendiente,
                    porCobrarCantidad: totalesCuotasPendientes.cantidadCuotasPendientes,
                    pagadasMonto: totalesCuotasPagadas.totalMontoCuotasPagadas,
                    pagadasCantidad: totalesCuotasPagadas.cantidadCuotasPagadas
                },

                // Equipos
                equipos: {
                    totalEquiposStock: totalEquiposStock,
                    vendidos: {
                        totalVendidos: vendidosStock.cantidad + vendidosCanje.cantidad,
                        stockCantidad: vendidosStock.cantidad,
                        canjeCantidad: vendidosCanje.cantidad,
                        stockPrecioCompra: vendidosStock.totalPrecioCompra,
                        canjeValorTasado: vendidosCanje.totalValorTasado,
                        costoTotalVendidos: vendidosStock.totalPrecioCompra + vendidosCanje.totalValorTasado
                    }
                },

                // Gastos
                gastos: {
                    totalGastosGenerales: totalGastos
                }
            }
        });

    } catch (error) {
        console.error('Error al obtener resumen general:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al obtener resumen general: ${error.message}`
        });
    }
};


// ==========================================
// 📊 REPORTE DE VENTAS DIRECTAS Y PLAN CANJE
// ==========================================
const reporteVentasDirectasCanje = async (req, res) => {
    try {
        // ==========================================
        // 1. VENTAS POR TIPO (contado y plan_canje)
        // ==========================================
        const ventasPorTipo = await Venta.aggregate([
            { 
                $match: { 
                    estado: true,
                    tipoVenta: { $in: ['contado', 'plan_canje'] }
                } 
            },
            {
                $group: {
                    _id: '$tipoVenta',
                    cantidad: { $sum: 1 },
                    totalMontoPagado: { $sum: '$montoPagado' },
                    totalDescuentos: { $sum: { $sum: '$descuentos.monto' } }
                }
            }
        ]);

        // Extraer resultados
        const ventasContado = ventasPorTipo.find(v => v._id === 'contado') || { cantidad: 0, totalMontoPagado: 0, totalDescuentos: 0 };
        const ventasPlanCanje = ventasPorTipo.find(v => v._id === 'plan_canje') || { cantidad: 0, totalMontoPagado: 0, totalDescuentos: 0 };

        // ==========================================
        // 2. VALOR TASADO DE EQUIPOS CANJE DISPONIBLES
        // ==========================================
        const valorTasadoCanjes = await Equipos.aggregate([
            { 
                $match: { 
                    origen: 'canje',
                    ventaOrigen: { $ne: null },
                    disponible: true
                } 
            },
            {
                $group: {
                    _id: null,
                    totalValorTasado: { $sum: '$valorTasado' },
                    cantidadEquiposCanje: { $sum: 1 }
                }
            }
        ]);

        const totalValorTasado = valorTasadoCanjes[0]?.totalValorTasado || 0;
        const cantidadCanjeDisponibles = valorTasadoCanjes[0]?.cantidadEquiposCanje || 0;

        // ==========================================
        // 3. LISTAR TODAS LAS VENTAS (contado + plan_canje)
        // ==========================================
        const ventas = await Venta.find({
            estado: true,
            tipoVenta: { $in: ['contado', 'plan_canje'] }
        })
        .select('cliente localidad tipoVenta fechaRealizada fechaEntrega vendedor producto montoTotal montoPagado descuentos pagos notas conducta_pago')
        .sort({ fechaRealizada: -1 })
        .lean();

        // ==========================================
        // 3.1 BUSCAR EQUIPOS CANJE ASOCIADOS A CADA VENTA
        // ==========================================
        const equiposCanje = await Equipos.find({
            origen: 'canje',
            ventaOrigen: { $ne: null }
        })
        .select('ventaOrigen nombre modelo capacidad valorTasado estado')
        .lean();

        // Crear mapa de equipos canje por ventaOrigen
        const mapaEquiposCanje = {};
        equiposCanje.forEach(equipo => {
            const ventaId = equipo.ventaOrigen.toString();
            if (!mapaEquiposCanje[ventaId]) {
                mapaEquiposCanje[ventaId] = [];
            }
            mapaEquiposCanje[ventaId].push({
                nombre: equipo.nombre,
                modelo: equipo.modelo || '',
                capacidad: equipo.capacidad || '',
                valorTasado: equipo.valorTasado,
                estado: equipo.estado || ''
            });
        });

        // ==========================================
        // 3.2 METODOS DE PAGO POR VENTA
        // ==========================================
        const metodosPagoTotales = {};

        // Formatear ventas con datos calculados
        const ventasFormateadas = ventas.map(venta => {
            const totalDescuentos = (venta.descuentos || []).reduce((sum, d) => sum + d.monto, 0);
            const totalPagos = (venta.pagos || []).reduce((sum, p) => sum + p.monto, 0);

            // Obtener equipos canje asociados a esta venta
            const equiposCanjeVenta = mapaEquiposCanje[venta._id.toString()] || [];
            const totalValorTasadoVenta = equiposCanjeVenta.reduce((sum, eq) => sum + eq.valorTasado, 0);

            // Acumular métodos de pago
            (venta.pagos || []).forEach(pago => {
                const metodo = pago.metodo || 'otro';
                if (!metodosPagoTotales[metodo]) {
                    metodosPagoTotales[metodo] = 0;
                }
                metodosPagoTotales[metodo] += pago.monto;
            });

            return {
                _id: venta._id,
                cliente: venta.cliente,
                localidad: venta.localidad,
                tipoVenta: venta.tipoVenta,
                fechaRealizada: venta.fechaRealizada,
                fechaEntrega: venta.fechaEntrega || null,
                vendedor: venta.vendedor || '',
                producto: venta.producto,
                montoTotal: venta.montoTotal,
                montoPagado: venta.montoPagado || 0,
                montoPendiente: venta.montoTotal - (venta.montoPagado || 0),
                totalDescuentos,
                totalPagos,
                cantidadPagos: (venta.pagos || []).length,
                pagos: (venta.pagos || []).map(p => ({
                    monto: p.monto,
                    metodo: p.metodo,
                    fecha: p.fecha
                })),
                descuentos: (venta.descuentos || []).map(d => ({
                    monto: d.monto,
                    descripcion: d.descripcion,
                    fecha: d.fecha
                })),
                notas: (venta.notas || []).map(n => ({
                    texto: n.texto,
                    tipo: n.tipo,
                    fecha: n.fecha,
                    usuario: n.usuario?.nombre || ''
                })),
                conducta_pago: venta.conducta_pago,
                // 👉 NUEVO: Equipos canje asociados
                equiposCanje: equiposCanjeVenta,
                totalValorTasadoVenta,
                // 👉 NUEVO: Monto pendiente real (descontando canje)
                montoPendienteReal: venta.montoTotal - (venta.montoPagado || 0) - totalValorTasadoVenta
            };
        });

        // ==========================================
        // 4. TOTALES FINALES
        // ==========================================
        const totalVentas = ventasContado.cantidad + ventasPlanCanje.cantidad;
        const totalMontoPagado = ventasContado.totalMontoPagado + ventasPlanCanje.totalMontoPagado;
        const totalDescuentosGeneral = ventasContado.totalDescuentos + ventasPlanCanje.totalDescuentos;

        // ==========================================
        // RESPUESTA
        // ==========================================
        return res.status(200).json({
            ok: true,
            message: 'Reporte de ventas directas y plan canje',
            data: {
                ventas: ventasFormateadas,
                resumen: {
                    totalVentas,
                    contado: {
                        cantidad: ventasContado.cantidad,
                        montoPagado: ventasContado.totalMontoPagado,
                        descuentos: ventasContado.totalDescuentos
                    },
                    plan_canje: {
                        cantidad: ventasPlanCanje.cantidad,
                        montoPagado: ventasPlanCanje.totalMontoPagado,
                        descuentos: ventasPlanCanje.totalDescuentos
                    },
                    totales: {
                        montoPagado: totalMontoPagado,
                        descuentos: totalDescuentosGeneral,
                        valorTasadoCanjes: totalValorTasado,
                        cantidadCanjeDisponibles,
                        // 👉 NUEVO: Métodos de pago
                        metodosPago: metodosPagoTotales
                    }
                }
            }
        });

    } catch (error) {
        console.error('Error al obtener reporte de ventas directas y canje:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al obtener reporte: ${error.message}`
        });
    }
};


// ==========================================
// 📊 REPORTE DE VENTAS FINANCIADAS (sistema1 y sistema2)
// ==========================================
const reporteVentasFinanciadas = async (req, res) => {
    try {
        const { anio } = req.query;

        // Validar año
        if (!anio) {
            return res.status(400).json({
                ok: false,
                message: 'El año es obligatorio'
            });
        }

        const anioNum = parseInt(anio);
        if (isNaN(anioNum) || anioNum < 2000 || anioNum > 2100) {
            return res.status(400).json({
                ok: false,
                message: 'Año inválido'
            });
        }

        // ==========================================
        // 1. BUSCAR VENTAS DE SISTEMA 1 Y SISTEMA 2
        // ==========================================
        const ventas = await Venta.find({
            estado: true,
            tipoVenta: { $in: ['sistema1', 'sistema2'] }
        })
        .select('cliente localidad tipoVenta fechaRealizada fechaEntrega vendedor producto montoTotal montoPagado descuentos conducta_pago cuotas')
        .sort({ fechaRealizada: -1 })
        .lean();

        // ==========================================
        // 2. INICIALIZAR RESUMEN ANUAL (12 meses)
        // ==========================================
        const nombresMeses = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];

        const resumenAnual = nombresMeses.map((nombre, index) => ({
            mes: index + 1,
            nombre,
            totalACobrar: 0,
            totalCobrado: 0,
            totalPendiente: 0,
            totalRecargos: 0,
            porcentajeCobranza: 0,
            cantidadCuotas: 0,
            cantidadCuotasPagadas: 0,
            cantidadCuotasPendientes: 0
        }));

        // ==========================================
        // 3. PROCESAR CADA VENTA Y SUS CUOTAS
        // ==========================================
        const ventasFormateadas = [];

        for (const venta of ventas) {
            // Formatear cuotas con información del mes
            const cuotasFormateadas = [];

            for (const cuota of venta.cuotas || []) {
                const fechaCobro = cuota.fechaCobro ? new Date(cuota.fechaCobro) : null;
                
                if (!fechaCobro) continue;

                const mesCuota = fechaCobro.getMonth() + 1;  // 1-12
                const anioCuota = fechaCobro.getFullYear();

                // Solo procesar si la cuota pertenece al año seleccionado
                if (anioCuota !== anioNum) continue;

                // Calcular recargos totales de esta cuota
                const totalRecargosCuota = (cuota.recargos || []).reduce((sum, r) => sum + r.monto, 0);

                // Calcular recargos que corresponden al mes
                const recargosDelMes = (cuota.recargos || []).filter(r => {
                    const fechaRecargo = r.fecha ? new Date(r.fecha) : null;
                    return fechaRecargo && fechaRecargo.getMonth() + 1 === mesCuota && fechaRecargo.getFullYear() === anioNum;
                });
                const totalRecargosMes = recargosDelMes.reduce((sum, r) => sum + r.monto, 0);

                // Actualizar resumen del mes
                resumenAnual[mesCuota - 1].cantidadCuotas++;
                resumenAnual[mesCuota - 1].totalACobrar += cuota.montoCuota;
                resumenAnual[mesCuota - 1].totalRecargos += totalRecargosMes;

                if (cuota.estado_cuota === 'pagada') {
                    resumenAnual[mesCuota - 1].totalCobrado += cuota.montoPagado || cuota.montoCuota;
                    resumenAnual[mesCuota - 1].cantidadCuotasPagadas++;
                } else if (cuota.estado_cuota === 'pendiente') {
                    resumenAnual[mesCuota - 1].totalPendiente += cuota.montoCuota;
                    resumenAnual[mesCuota - 1].cantidadCuotasPendientes++;
                } else if (cuota.estado_cuota === 'pago parcial') {
                    const pendienteCuota = cuota.montoCuota - (cuota.montoPagado || 0);
                    resumenAnual[mesCuota - 1].totalPendiente += pendienteCuota;
                    resumenAnual[mesCuota - 1].totalCobrado += cuota.montoPagado || 0;
                } else if (cuota.estado_cuota === 'no pagada') {
                    resumenAnual[mesCuota - 1].totalPendiente += cuota.montoCuota;
                }

                // Guardar cuota formateada
                cuotasFormateadas.push({
                    numeroCuota: cuota.numeroCuota,
                    montoCuota: cuota.montoCuota,
                    montoPagado: cuota.montoPagado || 0,
                    saldoPendiente: cuota.montoCuota - (cuota.montoPagado || 0),
                    estadoCuota: cuota.estado_cuota,
                    fechaCobro: cuota.fechaCobro,
                    fechaCobrada: cuota.fechaCobrada || null,
                    metodoPago: cuota.metodoPago || '',
                    cobrador: cuota.cobrador?.nombre || '',
                    recargos: (cuota.recargos || []).map(r => ({
                        monto: r.monto,
                        motivo: r.motivo,
                        fecha: r.fecha,
                        diasAtraso: r.diasAtraso
                    })),
                    totalRecargos: totalRecargosCuota,
                    notas: (cuota.notas || []).map(n => ({
                        texto: n.texto,
                        fecha: n.fecha
                    }))
                });
            }

            // Calcular totales de la venta
            const totalDescuentos = (venta.descuentos || []).reduce((sum, d) => sum + d.monto, 0);
            const totalRecargosVenta = (venta.cuotas || []).reduce((sum, c) => {
                return sum + (c.recargos || []).reduce((s, r) => s + r.monto, 0);
            }, 0);

            // Formatear venta con sus cuotas filtradas por año
            ventasFormateadas.push({
                _id: venta._id,
                cliente: venta.cliente,
                localidad: venta.localidad,
                tipoVenta: venta.tipoVenta,
                fechaRealizada: venta.fechaRealizada,
                fechaEntrega: venta.fechaEntrega || null,
                vendedor: venta.vendedor || '',
                producto: venta.producto,
                montoTotal: venta.montoTotal,
                montoPagado: venta.montoPagado || 0,
                montoPendiente: venta.montoTotal - (venta.montoPagado || 0),
                totalDescuentos,
                totalRecargos: totalRecargosVenta,
                conducta_pago: venta.conducta_pago,
                cuotas: cuotasFormateadas
            });
        }

        // ==========================================
        // 4. CALCULAR PORCENTAJE DE COBRANZA POR MES
        // ==========================================
        resumenAnual.forEach(mes => {
            if (mes.totalACobrar > 0) {
                mes.porcentajeCobranza = Math.round((mes.totalCobrado / mes.totalACobrar) * 100);
            }
        });

        // ==========================================
        // 5. ENTREGAS FUTURAS (solo sistema2)
        // ==========================================
        const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
        hoy.setHours(0, 0, 0, 0);

        const entregasFuturas = ventas
            .filter(venta => 
                venta.tipoVenta === 'sistema2' && 
                venta.fechaEntrega && 
                new Date(venta.fechaEntrega) >= hoy
            )
            .map(venta => ({
                ventaId: venta._id,
                cliente: {
                    nombre: venta.cliente.nombre,
                    apellido: venta.cliente.apellido,
                    dni: venta.cliente.dni,
                    telefono: venta.cliente.telefono || ''
                },
                producto: {
                    nombre: venta.producto.nombre,
                    modelo: venta.producto.modelo || '',
                    capacidad: venta.producto.capacidad || '',
                    color: venta.producto.color || ''
                },
                fechaEntrega: venta.fechaEntrega,
                localidad: venta.localidad,
                vendedor: venta.vendedor || '',
                montoTotal: venta.montoTotal,
                montoPagado: venta.montoPagado || 0,
                conducta_pago: venta.conducta_pago,
                // Cuota de entrega (buscamos la nota [ENTREGA] en las cuotas)
                cuotaEntrega: (() => {
                    for (const cuota of venta.cuotas || []) {
                        const tieneNotaEntrega = (cuota.notas || []).some(n => 
                            n.texto.includes('[ENTREGA]')
                        );
                        if (tieneNotaEntrega) {
                            return {
                                numeroCuota: cuota.numeroCuota,
                                fechaCobro: cuota.fechaCobro,
                                estadoCuota: cuota.estado_cuota,
                                montoCuota: cuota.montoCuota,
                                montoPagado: cuota.montoPagado || 0
                            };
                        }
                    }
                    return null;
                })()
            }))
            .sort((a, b) => new Date(a.fechaEntrega) - new Date(b.fechaEntrega));

        // ==========================================
        // 6. TOTALES GENERALES DEL AÑO
        // ==========================================
        const totalesAnuales = resumenAnual.reduce((acc, mes) => {
            acc.totalACobrar += mes.totalACobrar;
            acc.totalCobrado += mes.totalCobrado;
            acc.totalPendiente += mes.totalPendiente;
            acc.totalRecargos += mes.totalRecargos;
            return acc;
        }, { totalACobrar: 0, totalCobrado: 0, totalPendiente: 0, totalRecargos: 0 });

        totalesAnuales.porcentajeCobranza = totalesAnuales.totalACobrar > 0
            ? Math.round((totalesAnuales.totalCobrado / totalesAnuales.totalACobrar) * 100)
            : 0;

        // ==========================================
        // RESPUESTA
        // ==========================================
        return res.status(200).json({
            ok: true,
            message: `Reporte de ventas financiadas ${anioNum}`,
            data: {
                anio: anioNum,
                resumenAnual,
                totalesAnuales,
                ventas: ventasFormateadas,
                entregasFuturas,
                cantidadEntregasFuturas: entregasFuturas.length
            }
        });

    } catch (error) {
        console.error('Error al obtener reporte de ventas financiadas:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al obtener reporte: ${error.message}`
        });
    }
};

// ==========================================
// 📋 LISTAR CLIENTES (con filtros y paginación)
// ==========================================
const listarClientes = async (req, res) => {
    try {
        const {
            nombre,
            apellido,
            dni,
            email,
            telefono,
            situacionCrediticia,
            activo,
            pagina = 1,
            limite = 50
        } = req.query;

        // ==========================================
        // CONSTRUIR FILTROS
        // ==========================================
        const filtros = {};

        if (activo !== undefined && activo !== '') {
            filtros.activo = activo === 'true';
        }

        if (nombre) {
            filtros.nombre = { $regex: nombre, $options: 'i' };
        }

        if (apellido) {
            filtros.apellido = { $regex: apellido, $options: 'i' };
        }

        if (dni) {
            filtros.dni = { $regex: dni, $options: 'i' };
        }

        if (email) {
            filtros.email = { $regex: email, $options: 'i' };
        }

        if (telefono) {
            filtros.$or = [
                { telefono: { $regex: telefono, $options: 'i' } },
                { telefono2: { $regex: telefono, $options: 'i' } }
            ];
        }

        if (situacionCrediticia !== undefined && situacionCrediticia !== '') {
            filtros.situacionCrediticia = parseInt(situacionCrediticia);
        }

        // ==========================================
        // PAGINACIÓN
        // ==========================================
        const skip = (parseInt(pagina) - 1) * parseInt(limite);
        const limit = parseInt(limite);

        // ==========================================
        // CONSULTAR
        // ==========================================
        const [clientes, total] = await Promise.all([
            Cliente.find(filtros)
                .sort({ apellido: 1, nombre: 1 })  // Ordenar por apellido
                .skip(skip)
                .limit(limit)
                .lean(),
            Cliente.countDocuments(filtros)
        ]);

        // ==========================================
        // FORMATEAR RESPUESTA
        // ==========================================
        const clientesFormateados = clientes.map(cliente => ({
            _id: cliente._id,
            nombre: cliente.nombre,
            apellido: cliente.apellido,
            nombreCompleto: `${cliente.nombre} ${cliente.apellido}`,
            dni: cliente.dni,
            cuil: cliente.cuil || '',
            telefono: cliente.telefono || '',
            telefono2: cliente.telefono2 || '',
            email: cliente.email || '',
            direccion: cliente.direccion || '',
            situacionCrediticia: cliente.situacionCrediticia || null,
            activo: cliente.activo,
            createdAt: cliente.createdAt,
            updatedAt: cliente.updatedAt
        }));

        // ==========================================
        // RESUMEN
        // ==========================================
        const resumen = await Cliente.aggregate([
            {
                $group: {
                    _id: null,
                    totalClientes: { $sum: 1 },
                    totalActivos: {
                        $sum: { $cond: [{ $eq: ['$activo', true] }, 1, 0] }
                    },
                    totalInactivos: {
                        $sum: { $cond: [{ $eq: ['$activo', false] }, 1, 0] }
                    }
                }
            }
        ]);

        const resumenClientes = resumen[0] || { totalClientes: 0, totalActivos: 0, totalInactivos: 0 };

        // ==========================================
        // PAGINACIÓN
        // ==========================================
        const totalPaginas = Math.ceil(total / limit);
        const hayMas = parseInt(pagina) < totalPaginas;
        const restantes = Math.max(0, total - (parseInt(pagina) * limit));

        return res.status(200).json({
            ok: true,
            message: 'Clientes encontrados',
            data: {
                clientes: clientesFormateados,
                paginacion: {
                    total,
                    pagina: parseInt(pagina),
                    limite: limit,
                    totalPaginas,
                    hayMas,
                    restantes
                },
                resumen: {
                    totalClientes: resumenClientes.totalClientes,
                    totalActivos: resumenClientes.totalActivos,
                    totalInactivos: resumenClientes.totalInactivos
                }
            }
        });

    } catch (error) {
        console.error('Error al listar clientes:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al listar clientes: ${error.message}`
        });
    }
};

// ==========================================
// 🔍 OBTENER CLIENTE POR ID
// ==========================================
const obtenerClientePorId = async (req, res) => {
    try {
        const { id } = req.params;

        const cliente = await Cliente.findById(id).lean();

        if (!cliente) {
            return res.status(404).json({
                ok: false,
                message: 'Cliente no encontrado'
            });
        }

        return res.status(200).json({
            ok: true,
            data: {
                _id: cliente._id,
                nombre: cliente.nombre,
                apellido: cliente.apellido,
                nombreCompleto: `${cliente.nombre} ${cliente.apellido}`,
                dni: cliente.dni,
                cuil: cliente.cuil || '',
                telefono: cliente.telefono || '',
                telefono2: cliente.telefono2 || '',
                email: cliente.email || '',
                direccion: cliente.direccion || '',
                situacionCrediticia: cliente.situacionCrediticia || null,
                activo: cliente.activo,
                createdAt: cliente.createdAt,
                updatedAt: cliente.updatedAt
            }
        });

    } catch (error) {
        console.error('Error al obtener cliente:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al obtener cliente: ${error.message}`
        });
    }
};

// ==========================================
// 📊 REPORTE DE GASTOS COMPLETO
// ==========================================
const reporteGastos = async (req, res) => {
    try {
        const { anio } = req.query;

        // Validar año
        if (!anio) {
            return res.status(400).json({
                ok: false,
                message: 'El año es obligatorio'
            });
        }

        const anioNum = parseInt(anio);
        if (isNaN(anioNum) || anioNum < 2000 || anioNum > 2100) {
            return res.status(400).json({
                ok: false,
                message: 'Año inválido'
            });
        }

        // ==========================================
        // 1. BUSCAR TODOS LOS GASTOS DEL AÑO
        // ==========================================
        const fechaInicio = new Date(Date.UTC(anioNum, 0, 1, 3, 0, 0));
        const fechaFin = new Date(Date.UTC(anioNum + 1, 0, 1, 2, 59, 59, 999));

        const gastos = await Gastos.find({
            fecha: { $gte: fechaInicio, $lte: fechaFin }
        })
        .sort({ fecha: 1 })
        .lean();

        // ==========================================
        // 2. INICIALIZAR RESUMEN ANUAL (12 meses)
        // ==========================================
        const nombresMeses = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];

        const resumenAnual = nombresMeses.map((nombre, index) => ({
            mes: index + 1,
            nombre,
            totalGastos: 0,
            cantidadGastos: 0
        }));

        // ==========================================
        // 3. PROCESAR CADA GASTO
        // ==========================================
        const gastosFormateados = gastos.map(gasto => {
            const fecha = new Date(gasto.fecha);
            const mes = fecha.getMonth() + 1;

            // Actualizar resumen del mes
            resumenAnual[mes - 1].totalGastos += gasto.Monto_gasto;
            resumenAnual[mes - 1].cantidadGastos++;

            return {
                _id: gasto._id,
                descripcion: gasto.descripcion_gasto,
                monto: gasto.Monto_gasto,
                responsable: gasto.responsable,
                fecha: gasto.fecha,
                fechaFormateada: fecha.toLocaleDateString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                }),
                mes: mes,
                nombreMes: nombresMeses[mes - 1],
                anio: fecha.getFullYear(),
                createdAt: gasto.createdAt,
                updatedAt: gasto.updatedAt
            };
        });

        // ==========================================
        // 4. CALCULAR TOTALES ANUALES
        // ==========================================
        const totalesAnuales = resumenAnual.reduce((acc, mes) => {
            acc.totalGastosAnuales += mes.totalGastos;
            acc.totalCantidadGastos += mes.cantidadGastos;
            return acc;
        }, { totalGastosAnuales: 0, totalCantidadGastos: 0 });

        // ==========================================
        // 5. MES CON MÁS GASTOS
        // ==========================================
        const mesMayorGasto = resumenAnual.reduce((max, mes) => 
            mes.totalGastos > max.totalGastos ? mes : max
        , resumenAnual[0]);

        // ==========================================
        // 6. TOTALES GENERALES (todos los años)
        // ==========================================
        const resumenGeneral = await Gastos.aggregate([
            {
                $group: {
                    _id: null,
                    totalGastos: { $sum: '$Monto_gasto' },
                    cantidadGastos: { $sum: 1 },
                    gastoPromedio: { $avg: '$Monto_gasto' },
                    gastoMinimo: { $min: '$Monto_gasto' },
                    gastoMaximo: { $max: '$Monto_gasto' }
                }
            }
        ]);

        const totalesGenerales = resumenGeneral[0] || {
            totalGastos: 0,
            cantidadGastos: 0,
            gastoPromedio: 0,
            gastoMinimo: 0,
            gastoMaximo: 0
        };

        return res.status(200).json({
            ok: true,
            message: `Reporte de gastos ${anioNum}`,
            data: {
                anio: anioNum,
                resumenAnual,
                totalesAnuales,
                mesMayorGasto: {
                    mes: mesMayorGasto.mes,
                    nombre: mesMayorGasto.nombre,
                    total: mesMayorGasto.totalGastos
                },
                gastos: gastosFormateados,
                // 👉 Totales generales (todos los años)
                totalesGenerales: {
                    totalGastos: totalesGenerales.totalGastos,
                    cantidadGastos: totalesGenerales.cantidadGastos,
                    gastoPromedio: Math.round(totalesGenerales.gastoPromedio || 0),
                    gastoMinimo: totalesGenerales.gastoMinimo || 0,
                    gastoMaximo: totalesGenerales.gastoMaximo || 0
                }
            }
        });

    } catch (error) {
        console.error('Error al obtener reporte de gastos:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al obtener reporte de gastos: ${error.message}`
        });
    }
};

// ==========================================
// 📥 CREAR GASTO
// ==========================================
const crearGasto = async (req, res) => {
    try {
        const {
            descripcion_gasto,
            Monto_gasto,
            responsable,
            fecha
        } = req.body;

        // ==========================================
        // VALIDACIONES
        // ==========================================
        if (!descripcion_gasto || !descripcion_gasto.trim()) {
            return res.status(400).json({
                ok: false,
                message: 'La descripción del gasto es obligatoria'
            });
        }

        if (!Monto_gasto || Monto_gasto <= 0) {
            return res.status(400).json({
                ok: false,
                message: 'El monto del gasto debe ser mayor a 0'
            });
        }

        if (!responsable || !responsable.trim()) {
            return res.status(400).json({
                ok: false,
                message: 'El responsable del gasto es obligatorio'
            });
        }

        // ==========================================
        // NORMALIZAR FECHA A ARGENTINA (UTC-3)
        // ==========================================
        const fechaARG = fecha
            ? new Date(fecha + 'T00:00:00-03:00')
            : new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));

        // ==========================================
        // CREAR GASTO
        // ==========================================
        const nuevoGasto = new Gastos({
            descripcion_gasto: descripcion_gasto.trim(),
            Monto_gasto: Monto_gasto,
            responsable: responsable.trim(),
            fecha: fechaARG
        });

        await nuevoGasto.save();

        // ==========================================
        // RESPUESTA CON DATOS FORMATEADOS
        // ==========================================
        const gastoFormateado = {
            _id: nuevoGasto._id,
            descripcion: nuevoGasto.descripcion_gasto,
            monto: nuevoGasto.Monto_gasto,
            responsable: nuevoGasto.responsable,
            fecha: nuevoGasto.fecha,
            fechaFormateada: new Date(nuevoGasto.fecha).toLocaleDateString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            }),
            createdAt: nuevoGasto.createdAt,
            updatedAt: nuevoGasto.updatedAt
        };

        return res.status(201).json({
            ok: true,
            message: 'Gasto creado exitosamente',
            data: gastoFormateado
        });

    } catch (error) {
        console.error('Error al crear gasto:', error);

        if (error.name === 'ValidationError') {
            const mensajes = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                ok: false,
                message: mensajes.join('. ')
            });
        }

        return res.status(500).json({
            ok: false,
            message: `Error al crear gasto: ${error.message}`
        });
    }
};

const reportesVentasCeo = async (req, res) => {
    try {
        const {
            tipoVenta,
            localidad,
            conducta,
            busqueda,
            pagina = 1,
            limite = 15
        } = req.query;

        // ==========================================
        // FILTROS (igual que antes)
        // ==========================================
        const filtros = { estado: true };

        if (tipoVenta && tipoVenta.trim() !== '') filtros.tipoVenta = tipoVenta.trim();
        if (localidad && localidad.trim() !== '') filtros.localidad = localidad.toLowerCase().trim();
        if (conducta && conducta.trim() !== '') filtros.conducta_pago = conducta.trim();

        if (busqueda && busqueda.trim() !== '') {
            const busquedaTrim = busqueda.trim();
            filtros.$or = [
                { 'cliente.nombre': { $regex: busquedaTrim, $options: 'i' } },
                { 'cliente.apellido': { $regex: busquedaTrim, $options: 'i' } },
                { 'cliente.dni': { $regex: busquedaTrim, $options: 'i' } },
                { 'producto.nombre': { $regex: busquedaTrim, $options: 'i' } }
            ];
        }

        // ==========================================
        // PAGINACIÓN
        // ==========================================
        const paginaNum = parseInt(pagina);
        const limiteNum = parseInt(limite);
        const skip = (paginaNum - 1) * limiteNum;

        // ==========================================
        // CONSULTAR — TRAER TODO COMPLETO
        // ==========================================
        const [ventas, total] = await Promise.all([
            Venta.find(filtros)
                .sort({ fechaRealizada: -1 })
                .skip(skip)
                .limit(limiteNum)
                .lean(),  // 👈 SIN select → trae TODOS los campos
            Venta.countDocuments(filtros)
        ]);

        // ==========================================
        // LABELS DE TIPO
        // ==========================================
        const tipoVentaLabels = {
            contado: 'Contado',
            plan_canje: 'Plan Canje',
            sistema1: 'Sistema 1',
            sistema2: 'Sistema 2'
        };

        // ==========================================
        // FORMATEAR VENTAS
        // ==========================================
        const ventasFormateadas = ventas.map(venta => {
            const tieneCuotas = venta.tipoVenta === 'sistema1' || venta.tipoVenta === 'sistema2';

            // Calcular resumen de cuotas (extra para el front)
            let cuotasResumen = null;
            if (tieneCuotas && venta.cuotas && venta.cuotas.length > 0) {
                const totalCuotas = venta.cuotas.length;
                const pagadas = venta.cuotas.filter(c => c.estado_cuota === 'pagada').length;
                const porcentajeCobrado = totalCuotas > 0 ? Math.round((pagadas / totalCuotas) * 100) : 0;

                cuotasResumen = {
                    total: totalCuotas,
                    pagadas,
                    porcentajeCobrado
                };
            }

            return {
                // 👇 TODO el documento original
                ...venta,

                // 👇 Campos calculados para el front
                tipoVentaLabel: tipoVentaLabels[venta.tipoVenta] || venta.tipoVenta,
                tieneCuotas,
                montoPendiente: (venta.montoTotal || 0) - (venta.montoPagado || 0),

                // 👇 Array completo (por seguridad, si no existía)
                cuotas: venta.cuotas || [],
                pagos: venta.pagos || [],
                descuentos: venta.descuentos || [],
                notas: venta.notas || [],

                // 👇 Resumen para la barra de progreso
                cuotasResumen,

                // 👇 Documentación asegurada
                documentacion: venta.documentacion || {
                    urlCarpeta: null,
                    fechaSubida: null,
                    subidoPor: null,
                    notas: null
                }
            };
        });

        // ==========================================
        // PAGINACIÓN FINAL
        // ==========================================
        const totalPaginas = Math.ceil(total / limiteNum);
        const hayMas = paginaNum < totalPaginas;
        const restantes = Math.max(0, total - (paginaNum * limiteNum));

        return res.status(200).json({
            ok: true,
            data: {
                ventas: ventasFormateadas,
                paginacion: {
                    total,
                    pagina: paginaNum,
                    limite: limiteNum,
                    totalPaginas,
                    hayMas,
                    restantes
                }
            }
        });

    } catch (error) {
        console.error('Error al obtener panel de ventas:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al obtener panel de ventas: ${error.message}`
        });
    }
};


// ==========================================
// 📤 AGREGAR DOCUMENTACIÓN A VENTA
// ==========================================
const agregarDocumentacion = async (req, res) => {
    try {
        const { idVenta } = req.params;
        const { urlCarpeta, notas, subidoPor } = req.body;

        // ==========================================
        // VALIDACIONES
        // ==========================================
        if (!idVenta) {
            return res.status(400).json({
                ok: false,
                message: 'El ID de la venta es obligatorio'
            });
        }

        if (!urlCarpeta || !urlCarpeta.trim()) {
            return res.status(400).json({
                ok: false,
                message: 'La URL de la carpeta es obligatoria'
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
        // VERIFICAR SI YA TIENE DOCUMENTACIÓN
        // ==========================================
        if (venta.documentacion?.urlCarpeta) {
            return res.status(400).json({
                ok: false,
                message: 'Esta venta ya tiene documentación. Usá el método de actualización.'
            });
        }

        // ==========================================
        // AGREGAR DOCUMENTACIÓN
        // ==========================================
        const fechaArgentina = new Date(new Date().toLocaleString('en-US', {
            timeZone: 'America/Argentina/Buenos_Aires'
        }));

        venta.documentacion = {
            urlCarpeta: urlCarpeta.trim(),
            fechaSubida: fechaArgentina,
            subidoPor: subidoPor || req.usuario?.nombre || 'Sistema',
            notas: notas?.trim() || null
        };

        // Agregar nota de historial
        venta.notas.push({
            texto: `[DOCUMENTACIÓN] Se agregó documentación a la venta. URL: ${urlCarpeta}`,
            fecha: fechaArgentina,
            tipo: 'importante',
            usuario: {
                nombre: subidoPor || req.usuario?.nombre || 'Sistema'
            }
        });

        await venta.save();

        return res.status(201).json({
            ok: true,
            message: 'Documentación agregada exitosamente',
            data: {
                _id: venta._id,
                documentacion: venta.documentacion
            }
        });

    } catch (error) {
        console.error('Error al agregar documentación:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al agregar documentación: ${error.message}`
        });
    }
};

// ==========================================
// ✏️ ACTUALIZAR DOCUMENTACIÓN DE VENTA
// ==========================================
const actualizarDocumentacion = async (req, res) => {
    try {
        const { idVenta } = req.params;
        const { urlCarpeta, notas, subidoPor } = req.body;

        // ==========================================
        // VALIDACIONES
        // ==========================================
        if (!idVenta) {
            return res.status(400).json({
                ok: false,
                message: 'El ID de la venta es obligatorio'
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
        // VERIFICAR QUE TENGA DOCUMENTACIÓN
        // ==========================================
        if (!venta.documentacion?.urlCarpeta) {
            return res.status(400).json({
                ok: false,
                message: 'Esta venta no tiene documentación. Usá el método para agregar.'
            });
        }

        // ==========================================
        // ACTUALIZAR CAMPOS (solo los que vienen)
        // ==========================================
        const fechaArgentina = new Date(new Date().toLocaleString('en-US', {
            timeZone: 'America/Argentina/Buenos_Aires'
        }));

        const cambios = [];

        if (urlCarpeta !== undefined && urlCarpeta.trim() !== '') {
            venta.documentacion.urlCarpeta = urlCarpeta.trim();
            cambios.push('URL de carpeta');
        }

        if (notas !== undefined) {
            venta.documentacion.notas = notas?.trim() || null;
            cambios.push('notas');
        }

        if (subidoPor !== undefined && subidoPor.trim() !== '') {
            venta.documentacion.subidoPor = subidoPor.trim();
            cambios.push('subidoPor');
        }

        // Actualizar fecha cada vez que se modifica
        venta.documentacion.fechaSubida = fechaArgentina;

        // Agregar nota de historial
        venta.notas.push({
            texto: `[DOCUMENTACIÓN ACTUALIZADA] Se modificó la documentación. Campos modificados: ${cambios.join(', ')}`,
            fecha: fechaArgentina,
            tipo: 'importante',
            usuario: {
                nombre: req.usuario?.nombre || 'Sistema'
            }
        });

        await venta.save();

        return res.status(200).json({
            ok: true,
            message: 'Documentación actualizada exitosamente',
            data: {
                _id: venta._id,
                documentacion: venta.documentacion
            }
        });

    } catch (error) {
        console.error('Error al actualizar documentación:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al actualizar documentación: ${error.message}`
        });
    }
};

// ==========================================
// 🔍 OBTENER DOCUMENTACIÓN DE VENTA
// ==========================================
const obtenerDocumentacion = async (req, res) => {
    try {
        const { idVenta } = req.params;

        const venta = await Venta.findById(idVenta)
            .select('cliente.nombre cliente.apellido documentacion')
            .lean();

        if (!venta) {
            return res.status(404).json({
                ok: false,
                message: 'Venta no encontrada'
            });
        }

        return res.status(200).json({
            ok: true,
            data: {
                ventaId: venta._id,
                cliente: venta.cliente,
                documentacion: venta.documentacion || null
            }
        });

    } catch (error) {
        console.error('Error al obtener documentación:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al obtener documentación: ${error.message}`
        });
    }
};



module.exports = {
    reporteCobranzaMensual,
    historialCuotasPorVenta,
    reporteEquiposCanjeados,
    listarEquiposDisponibles2,
    listarVentasContado,

    resumenGeneral,
    reporteVentasDirectasCanje,
    reporteVentasFinanciadas,
    listarClientes,
    obtenerClientePorId,
    reporteGastos,
    crearGasto,

    reportesVentasCeo,
    agregarDocumentacion,
    actualizarDocumentacion,
    obtenerDocumentacion


};