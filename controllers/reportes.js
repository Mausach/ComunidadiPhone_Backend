const EqupoCanjes = require("../modelos/EqupoCanjes");
const Venta = require("../modelos/Venta");


// Reporte de cobranza mensual
/*
const reporteCobranzaMensual = async (req, res) => {
    const { mes, anio, localidad } = req.query;

    try {
        // Validar mes y año obligatorios
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
                msg: "Mes inválido. Debe ser un número del 1 al 12"
            });
        }

        if (isNaN(anioNum) || anioNum < 2000 || anioNum > 2100) {
            return res.status(400).json({
                ok: false,
                msg: "Año inválido"
            });
        }

        // Calcular rango del mes en UTC (Argentina = UTC-3)
        // Ejemplo: mes=3, anio=2024 -> desde 2024-03-01T03:00:00Z hasta 2024-04-01T02:59:59Z
        const fechaInicio = new Date(Date.UTC(anioNum, mesNum - 1, 1, 3, 0, 0)); // 1er día 00:00 ARG
        const fechaFin = new Date(Date.UTC(anioNum, mesNum, 1, 2, 59, 59, 999)); // Último día 23:59 ARG

        // Construir el match base
        const matchVenta = {
            estado: true,
            'cuotas.fechaCobro': { $gte: fechaInicio, $lte: fechaFin }
        };

        // Agregar filtro por localidad si viene
        if (localidad) {
            matchVenta.localidad = localidad.toLowerCase().trim();
        }

        // Aggregation pipeline
        const resultado = await Venta.aggregate([
            // 1. Filtrar ventas activas con cuotas en ese mes
            {
                $match: matchVenta
            },

            // 2. Desarmar el array de cuotas
            {
                $unwind: '$cuotas'
            },

            // 3. Filtrar solo las cuotas que caen en el mes
            {
                $match: {
                    'cuotas.fechaCobro': { $gte: fechaInicio, $lte: fechaFin }
                }
            },

            // 4. Proyectar los campos que necesito
            {
                $project: {
                    _id: 0,
                    idVenta: '$_id',
                    cliente: {
                        nombre: '$cliente.nombre',
                        apellido: '$cliente.apellido',
                        dni: '$cliente.dni',
                        telefono: '$cliente.telefono'
                    },
                    localidad: 1,
                    tipoVenta: 1,
                    vendedor: 1,
                    producto: {
                        nombre: '$producto.nombre',
                        modelo: '$producto.modelo',
                        valor: '$producto.valor'
                    },
                    cuota: {
                        numeroCuota: '$cuotas.numeroCuota',
                        montoCuota: '$cuotas.montoCuota',
                        metodoPago: '$cuotas.metodoPago',
                        estado_cuota: '$cuotas.estado_cuota',
                        fechaCobro: '$cuotas.fechaCobro',
                        fechaCobrada: '$cuotas.fechaCobrada',
                        cobrador: '$cuotas.cobrador',
                        notas: '$cuotas.notas'
                    },
                    conducta_pago: 1,
                    montoTotal: 1
                }
            },

            // 5. Ordenar por fecha de cobro y cliente
            {
                $sort: {
                    'cuota.fechaCobro': 1,
                    'cliente.apellido': 1
                }
            }
        ]);

        // Si no hay resultados
        if (resultado.length === 0) {
            return res.status(200).json({
                ok: true,
                msg: `No se encontraron cuotas para cobrar en ${mes}/${anio}`,
                totalCuotas: 0,
                resumen: {
                    totalPagado: 0,
                    totalPendiente: 0,
                    totalNoPagado: 0,
                    cantidadPagadas: 0,
                    cantidadPendientes: 0,
                    cantidadNoPagadas: 0
                },
                cuotas: []
            });
        }

        // Calcular resumen
        const resumen = resultado.reduce((acc, item) => {
            if (item.cuota.estado_cuota === 'pagada') {
                acc.totalPagado += item.cuota.montoCuota;
                acc.cantidadPagadas += 1;
            } else if (item.cuota.estado_cuota === 'pendiente') {
                acc.totalPendiente += item.cuota.montoCuota;
                acc.cantidadPendientes += 1;
            } else if (item.cuota.estado_cuota === 'no pagada') {
                acc.totalNoPagado += item.cuota.montoCuota;
                acc.cantidadNoPagadas += 1;
            }
            return acc;
        }, {
            totalPagado: 0,
            totalPendiente: 0,
            totalNoPagado: 0,
            cantidadPagadas: 0,
            cantidadPendientes: 0,
            cantidadNoPagadas: 0
        });

        // Respuesta exitosa
        res.status(200).json({
            ok: true,
            msg: `Reporte de cobranza ${mes}/${anio}${localidad ? ' - ' + localidad : ''}`,
            totalCuotas: resultado.length,
            resumen,
            cuotas: resultado
        });

    } catch (error) {
        console.error('Error en reporte de cobranza:', error);
        res.status(500).json({
            ok: false,
            msg: "Error al generar el reporte de cobranza"
        });
    }
};
*/


// Reporte de cobranza mensual agrupado por localidad
const reporteCobranzaPorLocalidad = async (req, res) => {
    const { mes, anio } = req.query;

    try {
        if (!mes || !anio) {
            return res.status(400).json({
                ok: false,
                msg: "El mes y año son obligatorios"
            });
        }

        const mesNum = parseInt(mes);
        const anioNum = parseInt(anio);

        const fechaInicio = new Date(Date.UTC(anioNum, mesNum - 1, 1, 3, 0, 0));
        const fechaFin = new Date(Date.UTC(anioNum, mesNum, 1, 2, 59, 59, 999));

        const resultado = await Venta.aggregate([
            {
                $match: {
                    estado: true,
                    'cuotas.fechaCobro': { $gte: fechaInicio, $lte: fechaFin }
                }
            },
            {
                $unwind: '$cuotas'
            },
            {
                $match: {
                    'cuotas.fechaCobro': { $gte: fechaInicio, $lte: fechaFin }
                }
            },
            {
                $group: {
                    _id: '$localidad',
                    totalCuotas: { $sum: 1 },
                    totalPagado: {
                        $sum: {
                            $cond: [{ $eq: ['$cuotas.estado_cuota', 'pagada'] }, '$cuotas.montoCuota', 0]
                        }
                    },
                    totalPendiente: {
                        $sum: {
                            $cond: [{ $eq: ['$cuotas.estado_cuota', 'pendiente'] }, '$cuotas.montoCuota', 0]
                        }
                    },
                    totalNoPagado: {
                        $sum: {
                            $cond: [{ $eq: ['$cuotas.estado_cuota', 'no pagada'] }, '$cuotas.montoCuota', 0]
                        }
                    },
                    cuotasPagadas: {
                        $sum: {
                            $cond: [{ $eq: ['$cuotas.estado_cuota', 'pagada'] }, 1, 0]
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
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    localidad: '$_id',
                    totalCuotas: 1,
                    totalPagado: 1,
                    totalPendiente: 1,
                    totalNoPagado: 1,
                    cuotasPagadas: 1,
                    cuotasPendientes: 1,
                    cuotasNoPagadas: 1
                }
            },
            {
                $sort: { localidad: 1 }
            }
        ]);

        res.status(200).json({
            ok: true,
            msg: `Reporte de cobranza por localidad ${mes}/${anio}`,
            localidades: resultado
        });

    } catch (error) {
        console.error('Error en reporte por localidad:', error);
        res.status(500).json({
            ok: false,
            msg: "Error al generar el reporte por localidad"
        });
    }
};

const reporteCobranzaMensual = async (req, res) => {
    const { mes, anio } = req.query;

    try {
        // Validaciones
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

        // Calcular rango del mes considerando zona horaria Argentina (UTC-3)
        const fechaInicio = new Date(Date.UTC(anioNum, mesNum - 1, 1, 3, 0, 0));
        const fechaFin = new Date(Date.UTC(anioNum, mesNum, 1, 2, 59, 59, 999));

        const resultado = await Venta.aggregate([
            // 1. Solo ventas activas que tengan cuotas en ese mes
            {
                $match: {
                    estado: true,
                    cuotas: { $exists: true, $not: { $size: 0 } },
                    'cuotas.fechaCobro': { $gte: fechaInicio, $lte: fechaFin }
                }
            },

            // 2. Desarmar array de cuotas
            {
                $unwind: '$cuotas'
            },

            // 3. Filtrar solo las cuotas del mes
            {
                $match: {
                    'cuotas.fechaCobro': { $gte: fechaInicio, $lte: fechaFin }
                }
            },

            // 4. Proyectar solo lo que necesitas
            {
                $project: {
                    _id: 0,
                    idVenta: '$_id',
                    cliente: {
                        nombre: '$cliente.nombre',
                        apellido: '$cliente.apellido'
                    },
                    localidad: 1,
                    tipoVenta: 1,
                    producto: '$producto.nombre',
                    numeroCuota: '$cuotas.numeroCuota',
                    montoCuota: '$cuotas.montoCuota',
                    estadoCuota: '$cuotas.estado_cuota',
                    fechaCobro: '$cuotas.fechaCobro',
                    fechaCobrada: '$cuotas.fechaCobrada',
                    metodoPago: '$cuotas.metodoPago',
                    cobrador: '$cuotas.cobrador.nombre',
                    notas: '$cuotas.notas'
                }
            },

            // 5. Ordenar por fecha de cobro
            {
                $sort: {
                    fechaCobro: 1
                }
            }
        ]);

        if (resultado.length === 0) {
            return res.status(200).json({
                ok: true,
                msg: `No hay cuotas para el período ${mesNum}/${anioNum}`,
                totalCuotas: 0,
                cuotas: []
            });
        }

        res.status(200).json({
            ok: true,
            msg: `Reporte de cobranza ${mesNum}/${anioNum}`,
            totalCuotas: resultado.length,
            cuotas: resultado
        });

    } catch (error) {
        console.error('Error en reporte de cobranza:', error);
        res.status(500).json({
            ok: false,
            msg: "Error al generar el reporte"
        });
    }
};

const historialCuotasPorVenta = async (req, res) => {
    try {
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

            // 3. Agrupar por venta para armar el historial
            {
                $group: {
                    _id: '$_id',
                    cliente: { $first: '$cliente' },
                    localidad: { $first: '$localidad' },
                    tipoVenta: { $first: '$tipoVenta' },
                    frecuenciaCuota: { $first: '$frecuenciaCuota' }, // 👈 NUEVO
                    vendedor: { $first: '$vendedor' },
                    producto: { $first: '$producto.nombre' },
                    modelo: { $first: '$producto.modelo' },
                    montoTotal: { $first: '$montoTotal' },
                    conducta_pago: { $first: '$conducta_pago' },
                    totalCuotas: { $sum: 1 },
                    cuotasPagadas: {
                        $sum: {
                            $cond: [{ $eq: ['$cuotas.estado_cuota', 'pagada'] }, 1, 0]
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
                    montoPagado: {
                        $sum: {
                            $cond: [
                                { $eq: ['$cuotas.estado_cuota', 'pagada'] },
                                '$cuotas.montoCuota',
                                0
                            ]
                        }
                    },
                    montoPendiente: {
                        $sum: {
                            $cond: [
                                { $eq: ['$cuotas.estado_cuota', 'pendiente'] },
                                '$cuotas.montoCuota',
                                0
                            ]
                        }
                    },
                    montoNoPagado: {
                        $sum: {
                            $cond: [
                                { $eq: ['$cuotas.estado_cuota', 'no pagada'] },
                                '$cuotas.montoCuota',
                                0
                            ]
                        }
                    },
                    detalleCuotas: {
                        $push: {
                            numeroCuota: '$cuotas.numeroCuota',
                            montoCuota: '$cuotas.montoCuota',
                            estadoCuota: '$cuotas.estado_cuota',
                            fechaCobro: '$cuotas.fechaCobro',
                            fechaCobrada: '$cuotas.fechaCobrada',
                            metodoPago: '$cuotas.metodoPago',
                            cobrador: '$cuotas.cobrador.nombre'
                        }
                    }
                }
            },

            // 4. Ordenar detalle de cuotas por número
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

            // 5. Calcular porcentaje de avance
            {
                $addFields: {
                    porcentajeCobrado: {
                        $cond: [
                            { $gt: ['$montoTotal', 0] },
                            { $round: [{ $multiply: [{ $divide: ['$montoPagado', '$montoTotal'] }, 100] }, 2] },
                            0
                        ]
                    }
                }
            },

            // 6. Ordenar por conducta de pago y cliente
            {
                $sort: {
                    conducta_pago: 1,
                    'cliente.apellido': 1
                }
            },

            // 7. Proyectar final
            {
                $project: {
                    _id: 0,
                    idVenta: '$_id',
                    cliente: 1,
                    localidad: 1,
                    tipoVenta: 1,
                    frecuenciaCuota: 1, // 👈 NUEVO
                    vendedor: 1,
                    producto: 1,
                    modelo: 1,
                    montoTotal: 1,
                    conducta_pago: 1,
                    totalCuotas: 1,
                    cuotasPagadas: 1,
                    cuotasPendientes: 1,
                    cuotasNoPagadas: 1,
                    montoPagado: 1,
                    montoPendiente: 1,
                    montoNoPagado: 1,
                    porcentajeCobrado: 1,
                    detalleCuotas: 1
                }
            }
        ]);

        if (resultado.length === 0) {
            return res.status(200).json({
                ok: true,
                msg: "No hay ventas con cuotas registradas",
                totalVentas: 0,
                ventas: []
            });
        }

        // Totales generales
        const totalesGenerales = resultado.reduce((acc, venta) => {
            acc.totalVentas += 1;
            acc.totalCuotas += venta.totalCuotas;
            acc.totalCuotasPagadas += venta.cuotasPagadas;
            acc.totalCuotasPendientes += venta.cuotasPendientes;
            acc.totalCuotasNoPagadas += venta.cuotasNoPagadas;
            acc.montoTotalGeneral += venta.montoTotal;
            acc.montoPagadoGeneral += venta.montoPagado;
            acc.montoPendienteGeneral += venta.montoPendiente;
            acc.montoNoPagadoGeneral += venta.montoNoPagado;
            return acc;
        }, {
            totalVentas: 0,
            totalCuotas: 0,
            totalCuotasPagadas: 0,
            totalCuotasPendientes: 0,
            totalCuotasNoPagadas: 0,
            montoTotalGeneral: 0,
            montoPagadoGeneral: 0,
            montoPendienteGeneral: 0,
            montoNoPagadoGeneral: 0
        });

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
            msg: "Error al generar el historial de cuotas"
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

module.exports = {
    reporteCobranzaPorLocalidad,
    reporteCobranzaMensual,
    historialCuotasPorVenta,
    reporteEquiposCanjeados
};