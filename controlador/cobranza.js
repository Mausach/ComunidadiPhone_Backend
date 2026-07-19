const Venta = require("../modelos/Venta");

/*
const cobrarCuota = async (req, res) => {
    try {
        const { idVenta } = req.params;
        const {
            numeroCuota,
            montoPagado,
            metodoPago,
            cobrador,
            nota  // opcional
        } = req.body;

        // ==========================================
        // VALIDACIONES
        // ==========================================
        if (!numeroCuota || !montoPagado || !metodoPago) {
            return res.status(400).json({
                ok: false,
                message: 'Faltan campos obligatorios (numeroCuota, montoPagado, metodoPago)'
            });
        }

        if (!cobrador || !cobrador.nombre) {
            return res.status(400).json({
                ok: false,
                message: 'El nombre del cobrador es obligatorio'
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

        if (!venta.estado) {
            return res.status(400).json({
                ok: false,
                message: 'La venta está inactiva'
            });
        }

        // ==========================================
        // BUSCAR CUOTA
        // ==========================================
        const cuota = venta.cuotas.find(c => c.numeroCuota === Number(numeroCuota));

        if (!cuota) {
            return res.status(404).json({
                ok: false,
                message: `Cuota número ${numeroCuota} no encontrada`
            });
        }

        // Validar que no esté pagada
        if (cuota.estado_cuota === 'pagada') {
            return res.status(400).json({
                ok: false,
                message: `La cuota número ${numeroCuota} ya está pagada`
            });
        }

        // ==========================================
        // ACTUALIZAR CUOTA
        // ==========================================
        const fechaPago = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));

        cuota.estado_cuota = 'pagada';
        cuota.fechaCobrada = fechaPago;
        cuota.metodoPago = metodoPago;
        cuota.montoCuota = montoPagado; // Por si se editó el monto
        cuota.cobrador = {
            nombre: cobrador.nombre
        };

        // Agregar nota si viene
        if (nota && nota.trim() !== '') {
            cuota.notas.push({
                texto: nota,
                fecha: fechaPago,
                usuario: {
                    nombre: cobrador.nombre
                }
            });
        }

        // ==========================================
        // ACTUALIZAR MONTOS DE LA VENTA
        // ==========================================
        const totalPagado = venta.cuotas
            .filter(c => c.estado_cuota === 'pagada')
            .reduce((total, c) => total + c.montoCuota, 0);

        venta.montoPagado = totalPagado;

        // Agregar pago inicial si existe
        if (venta.pagos && venta.pagos.length > 0) {
            const pagosIniciales = venta.pagos.reduce((total, p) => total + p.monto, 0);
            venta.montoPagado += pagosIniciales;
        }

        // ==========================================
        // ACTUALIZAR CONDUCTA DE PAGO
        // ==========================================
        const todasPagadas = venta.cuotas.every(c => c.estado_cuota === 'pagada');
        
        if (todasPagadas) {
            venta.conducta_pago = 'cancelado';
        } else {
            venta.conducta_pago = 'al dia';
        }

        // ==========================================
        // GUARDAR CAMBIOS
        // ==========================================
        await venta.save();

        return res.status(200).json({
            ok: true,
            message: `Cuota número ${numeroCuota} cobrada exitosamente`,
            data: {
                cuota,
                montoPagadoTotal: venta.montoPagado,
                montoTotal: venta.montoTotal,
                conducta_pago: venta.conducta_pago
            }
        });

    } catch (error) {
        console.error('Error al cobrar cuota:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al cobrar cuota: ${error.message}`
        });
    }
};

*/


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
            estado: true,  // Solo ventas activas
            cuotas: { $exists: true, $ne: [] }  // Solo ventas con cuotas
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

            // Buscar ventas que tengan al menos una cuota en ese rango
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

            // 👉 NUEVO: Monto pendiente = suma de cuotas NO pagadas
            const montoPendiente = venta.cuotas
                .filter(c => c.estado_cuota !== 'pagada')
                .reduce((total, c) => total + c.montoCuota, 0);

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

            // Encontrar la cuota más próxima (siempre disponible)
            const hoy = new Date();
            const cuotaProxima = venta.cuotas
                .filter(c => c.estado_cuota === 'pendiente')
                .sort((a, b) => new Date(a.fechaCobro) - new Date(b.fechaCobro))[0];

            return {
                _id: venta._id,
                cliente: venta.cliente,
                producto: venta.producto,
                localidad: venta.localidad,
                tipoVenta: venta.tipoVenta,
                fechaRealizada: venta.fechaRealizada,
                montoTotal: venta.montoTotal,
                montoPagado: venta.montoPagado || 0,
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
                    fechaCobro: cuotaProxima.fechaCobro,
                    diasRestantes: Math.ceil((new Date(cuotaProxima.fechaCobro) - hoy) / (1000 * 60 * 60 * 24))
                } : null,
                // Cuotas que coinciden con el filtro de fechas
                cuotasEnRango: cuotasEnRango.length > 0 ? cuotasEnRango.map(c => ({
                    numeroCuota: c.numeroCuota,
                    fechaCobro: c.fechaCobro,
                    estado_cuota: c.estado_cuota
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
        // ✅ BIEN (Argentina está UTC-3, hay que restar para convertir a UTC)
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

            if (cuota.estado_cuota === 'pendiente' && new Date(cuota.fechaCobro) < hoy) {
                // Cuota vencida y no pagada → marcar como atrasada y calcular días
                diasAtraso = Math.ceil((hoy - new Date(cuota.fechaCobro)) / (1000 * 60 * 60 * 24));
            }

            return {
                ...cuota,
                diasAtraso,
                vencida: new Date(cuota.fechaCobro) < hoy && cuota.estado_cuota !== 'pagada'
            };
        });

        // ==========================================
        // CALCULAR RESUMEN
        // ==========================================
        const resumen = {
            totalCuotas: venta.cuotas.length,
            cuotasPagadas: venta.cuotas.filter(c => c.estado_cuota === 'pagada').length,
            cuotasPendientes: venta.cuotas.filter(c => c.estado_cuota === 'pendiente').length,
            cuotasVencidas: cuotasFormateadas.filter(c => c.vencida).length,
            montoTotal: venta.montoTotal,
            montoPagado: venta.montoPagado || 0,
            montoPendiente: venta.montoTotal - (venta.montoPagado || 0)
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
            if (!cuota.numeroCuota || !cuota.montoPagado || !cuota.metodoPago) {
                return res.status(400).json({
                    ok: false,
                    message: `Cada cuota debe tener numeroCuota, montoPagado y metodoPago`
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

            // Actualizar cuota
            cuota.estado_cuota = 'pagada';
            cuota.fechaCobrada = fechaPago;
            cuota.metodoPago = cuotaData.metodoPago;
            cuota.montoCuota = cuotaData.montoPagado;
            cuota.cobrador = {
                nombre: cobrador.nombre
            };

            // Agregar nota si viene
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

            cuotasProcesadas.push({
                numeroCuota: cuota.numeroCuota,
                monto: cuota.montoCuota,
                estado: 'pagada'
            });
        }

        // ==========================================
        // RECALCULAR MONTOS
        // ==========================================
        const totalPagadoCuotas = venta.cuotas
            .filter(c => c.estado_cuota === 'pagada')
            .reduce((total, c) => total + c.montoCuota, 0);

        venta.montoPagado = totalPagadoCuotas;

        // Sumar pagos iniciales si existen
        if (venta.pagos && venta.pagos.length > 0) {
            const pagosIniciales = venta.pagos.reduce((total, p) => total + p.monto, 0);
            venta.montoPagado += pagosIniciales;
        }

        // ==========================================
        // ACTUALIZAR CONDUCTA DE PAGO (CORREGIDO)
        // ==========================================
        const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
        hoy.setHours(0, 0, 0, 0);

        // Solo contar cuotas VENCIDAS y no pagadas
        const cuotasVencidasNoPagadas = venta.cuotas.filter(c => {
            const fechaCobro = new Date(c.fechaCobro);
            const vencida = fechaCobro < hoy;
            const noPagada = c.estado_cuota === 'no pagada' ||
                (c.estado_cuota === 'pendiente' && vencida);
            return noPagada;
        }).length;

        const todasPagadas = venta.cuotas.every(c => c.estado_cuota === 'pagada');

        if (todasPagadas) {
            venta.conducta_pago = 'cancelado';
        } else if (cuotasVencidasNoPagadas >= 4) {
            venta.conducta_pago = 'caducado';
        } else if (cuotasVencidasNoPagadas >= 2) {
            venta.conducta_pago = 'cobro judicial';
        } else if (cuotasVencidasNoPagadas >= 1) {
            venta.conducta_pago = 'atrasado';
        } else {
            venta.conducta_pago = 'al dia';
        }

        // ==========================================
        // GUARDAR
        // ==========================================
        await venta.save();

        return res.status(200).json({
            ok: true,
            message: `Se procesaron ${cuotasProcesadas.length} cuotas`,
            data: {
                cuotasProcesadas,
                cuotasConError,
                resumen: {
                    montoTotal: venta.montoTotal,
                    montoPagado: venta.montoPagado,
                    montoPendiente: venta.montoTotal - venta.montoPagado,
                    conducta_pago: venta.conducta_pago,
                    totalCuotas: venta.cuotas.length,
                    cuotasPagadas: venta.cuotas.filter(c => c.estado_cuota === 'pagada').length,
                    cuotasVencidasNoPagadas
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
        // ACTUALIZAR ESTADO
        // ==========================================
        const fechaArgentina = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));

        cuota.estado_cuota = nuevoEstado;

        // Si pasa a "pagada"
        if (nuevoEstado === 'pagada') {
            cuota.fechaCobrada = fechaArgentina;
            cuota.metodoPago = metodoPago || cuota.metodoPago || 'efectivo';
        }

        // Si pasa a "pago parcial"
        if (nuevoEstado === 'pago parcial') {
            cuota.metodoPago = metodoPago || cuota.metodoPago || 'efectivo';
        }

        // Si se desmarca como pagada o pago parcial, limpiar datos de cobro
        if ((estadoAnterior === 'pagada' || estadoAnterior === 'pago parcial') && 
            nuevoEstado !== 'pagada' && nuevoEstado !== 'pago parcial') {
            cuota.fechaCobrada = null;
            cuota.metodoPago = null;
        }

        // ==========================================
        // AGREGAR NOTA DE HISTORIAL
        // ==========================================
        let textoNota = `[CAMBIAR ESTADO] "${estadoAnterior}" → "${nuevoEstado}". Motivo: ${motivo || 'Sin especificar'}`;
        
        if (nuevoEstado === 'pago parcial' && montoParcial) {
            textoNota += `. Monto parcial cobrado: $${montoParcial}`;
        }

        cuota.notas.push({
            texto: textoNota,
            fecha: fechaArgentina,
            usuario: {
                nombre: usuario.nombre
            }
        });

        // ==========================================
        // RECALCULAR MONTO PAGADO
        // ==========================================
        const totalPagadoCuotas = venta.cuotas
            .filter(c => c.estado_cuota === 'pagada')
            .reduce((total, c) => total + c.montoCuota, 0);

        venta.montoPagado = totalPagadoCuotas;

        // ==========================================
        // ACTUALIZAR CONDUCTA DE PAGO (CORREGIDO)
        // ==========================================
        
        // Contar cuotas en estado "no pagada" (sin importar si vencieron)
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

        // ==========================================
        // GUARDAR CAMBIOS
        // ==========================================
        await venta.save();

        // Calcular cuotas vencidas (solo para informar, no para conducta)
        const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
        hoy.setHours(0, 0, 0, 0);

        const cuotasVencidasNoPagadas = venta.cuotas.filter(c => {
            if (c.estado_cuota === 'pagada') return false;
            const fechaCobro = new Date(c.fechaCobro);
            return fechaCobro < hoy;
        }).length;

        return res.status(200).json({
            ok: true,
            message: 'Estado de cuota actualizado exitosamente',
            data: {
                numeroCuota: cuota.numeroCuota,
                estadoAnterior,
                estadoNuevo: nuevoEstado,
                montoCuota: cuota.montoCuota,
                montoPagadoTotal: venta.montoPagado,
                conducta_pago: venta.conducta_pago,
                cuotasNoPagadas,
                cuotasVencidasNoPagadas  // Solo informativo
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
    listarCobranzasDelDia,
    detalleVentaCobranza,
    cobrarCuotas,
    ////////////
    editarFechaCuota,
    editarMontoCuota,
    cambiarEstadoCuota,
    agregarNotaCuota

};