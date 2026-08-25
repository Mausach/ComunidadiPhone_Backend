const EquipoStock = require("../modelos/EquipoStock");
const EqupoCanjes = require("../modelos/EqupoCanjes");
const Venta = require("../modelos/Venta");

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

module.exports = {
    reporteCobranzaMensual,
    historialCuotasPorVenta,
    reporteEquiposCanjeados,
    listarEquiposDisponibles,
    listarVentasContado
};