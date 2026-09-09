// controllers/EquipoController.js

//const Equipo = require('../modelos/Equipo');
const Equipos = require('../modelos/Equipos');
const Venta = require('../modelos/Venta');

// ==========================================
// 📥 CARGAR EQUIPO AL STOCK (origen: 'stock')
// ==========================================
const cargarEquipo = async (req, res) => {
    try {
        const {
            nombre,
            modelo,
            capacidad,      // 👉 NUEVO
            imei,
            color,
            bateria,
            localidad,
            estado,
            precioCompra,
            precioVenta,
            proveedor,
            fechaIngreso,
            notas
        } = req.body;

        // ==========================================
        // VALIDACIONES OBLIGATORIAS
        // ==========================================
        if (!nombre) {
            return res.status(400).json({
                ok: false,
                message: 'El nombre del equipo es obligatorio'
            });
        }

        if (!precioCompra || precioCompra <= 0) {
            return res.status(400).json({
                ok: false,
                message: 'El precio de compra debe ser mayor a 0'
            });
        }

        if (!precioVenta || precioVenta <= 0) {
            return res.status(400).json({
                ok: false,
                message: 'El precio de venta debe ser mayor a 0'
            });
        }

        // ==========================================
        // VALIDAR QUE PRECIO VENTA SEA MAYOR A COMPRA
        // ==========================================
        if (precioVenta <= precioCompra) {
            return res.status(400).json({
                ok: false,
                message: `El precio de venta ($${precioVenta}) debe ser mayor al precio de compra ($${precioCompra})`
            });
        }

        // ==========================================
        // VALIDAR IMEI (si viene)
        // ==========================================
        if (imei) {
            if (!/^\d{15}$/.test(imei)) {
                return res.status(400).json({
                    ok: false,
                    message: 'El IMEI debe tener 15 dígitos numéricos'
                });
            }

            const imeiExistente = await Equipos.findOne({ 
                imei: imei,
                disponible: true 
            });

            if (imeiExistente) {
                return res.status(400).json({
                    ok: false,
                    message: `El IMEI ${imei} ya está registrado como "${imeiExistente.nombre}"`
                });
            }
        }

        // ==========================================
        // PREPARAR DATOS
        // ==========================================
        const nuevoEquipo = new Equipos({
            origen: 'stock',  // 👉 Diferenciador
            nombre: nombre.trim(),
            modelo: modelo?.trim() || '',
            capacidad: capacidad?.trim() || '',
            imei: imei?.trim() || '',
            color: color?.trim() || '',
            bateria: bateria?.trim() || '',
            localidad: localidad?.trim().toLowerCase() || '',
            estado: estado || 'sellado',
            precioCompra,
            precioVenta,
            valorTasado: 0,
            proveedor: proveedor ? {
                nombre: proveedor.nombre?.trim() || '',
                telefono: proveedor.telefono?.trim() || '',
                email: proveedor.email?.trim() || '',
                factura: proveedor.factura?.trim() || ''
            } : {},
            fechaIngreso: fechaIngreso ? new Date(fechaIngreso) : new Date(),
            fechaRecepcion: null,
            fechaVenta: null,
            disponible: true,
            ventaOrigen: null,
            ventaAsociada: null,
            notas: notas ? notas.map(nota => ({
                texto: nota.texto,
                fecha: nota.fecha || new Date(),
                usuario: {
                    nombre: nota.usuario?.nombre || req.usuario?.nombre || 'Sistema'
                },
                tipo: nota.tipo || 'general'
            })) : []
        });

        // ==========================================
        // GUARDAR
        // ==========================================
        await nuevoEquipo.save();

        return res.status(201).json({
            ok: true,
            message: 'Equipo cargado al stock exitosamente',
            data: nuevoEquipo
        });

    } catch (error) {
        console.error('Error al cargar equipo:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                ok: false,
                message: 'Ya existe un equipo con ese IMEI en el sistema'
            });
        }

        return res.status(500).json({
            ok: false,
            message: `Error al cargar equipo: ${error.message}`
        });
    }
};

// ==========================================
// 📥 CARGAR EQUIPO DE CANJE (origen: 'canje')
// ==========================================
const cargarEquipoCanje = async (req, res) => {
    try {
        const {
            nombre,
            modelo,
            capacidad,      // 👉 NUEVO
            imei,
            color,
            bateria,
            localidad,
            estado,
            valorTasado,
            ventaOrigen,
            fechaRecepcion,
            notas
        } = req.body;

        // ==========================================
        // VALIDACIONES OBLIGATORIAS
        // ==========================================
        if (!nombre) {
            return res.status(400).json({
                ok: false,
                message: 'El nombre del equipo es obligatorio'
            });
        }

        if (!valorTasado || valorTasado <= 0) {
            return res.status(400).json({
                ok: false,
                message: 'El valor tasado debe ser mayor a 0'
            });
        }

        if (!ventaOrigen) {
            return res.status(400).json({
                ok: false,
                message: 'La venta de origen es obligatoria para un equipo de canje'
            });
        }

        // ==========================================
        // VALIDAR IMEI (si viene)
        // ==========================================
        if (imei) {
            if (!/^\d{15}$/.test(imei)) {
                return res.status(400).json({
                    ok: false,
                    message: 'El IMEI debe tener 15 dígitos numéricos'
                });
            }

            const imeiExistente = await Equipos.findOne({ 
                imei: imei,
                disponible: true 
            });

            if (imeiExistente) {
                return res.status(400).json({
                    ok: false,
                    message: `El IMEI ${imei} ya está registrado como "${imeiExistente.nombre}"`
                });
            }
        }

        // ==========================================
        // PREPARAR DATOS
        // ==========================================
        const nuevoEquipo = new Equipos({
            origen: 'canje',  // 👉 Diferenciador
            nombre: nombre.trim(),
            modelo: modelo?.trim() || '',
            capacidad: capacidad?.trim() || '',
            imei: imei?.trim() || '',
            color: color?.trim() || '',
            bateria: bateria?.trim() || '',
            localidad: localidad?.trim().toLowerCase() || '',
            estado: estado || 'bueno',
            precioCompra: 0,
            precioVenta: 0,
            valorTasado,
            proveedor: {},
            fechaIngreso: new Date(),
            fechaRecepcion: fechaRecepcion ? new Date(fechaRecepcion) : new Date(),
            fechaVenta: null,
            disponible: true,
            ventaOrigen,
            ventaAsociada: null,
            notas: notas ? notas.map(nota => ({
                texto: nota.texto,
                fecha: nota.fecha || new Date(),
                usuario: {
                    nombre: nota.usuario?.nombre || req.usuario?.nombre || 'Sistema'
                },
                tipo: nota.tipo || 'general'
            })) : []
        });

        // ==========================================
        // GUARDAR
        // ==========================================
        await nuevoEquipo.save();

        return res.status(201).json({
            ok: true,
            message: 'Equipo de canje cargado exitosamente',
            data: nuevoEquipo
        });

    } catch (error) {
        console.error('Error al cargar equipo de canje:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                ok: false,
                message: 'Ya existe un equipo con ese IMEI en el sistema'
            });
        }

        return res.status(500).json({
            ok: false,
            message: `Error al cargar equipo de canje: ${error.message}`
        });
    }
};

// ==========================================
// ✏️ EDITAR EQUIPO
// ==========================================
const editarEquipo = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            nombre,
            modelo,
            capacidad,
            imei,
            color,
            bateria,
            localidad,
            estado,
            precioCompra,
            precioVenta,
            valorTasado,
            proveedor,
            disponible,
            notas,
            agregarNota
        } = req.body;

        // ==========================================
        // BUSCAR EQUIPO
        // ==========================================
        const equipo = await Equipos.findById(id);

        if (!equipo) {
            return res.status(404).json({
                ok: false,
                message: 'Equipo no encontrado'
            });
        }

        // ==========================================
        // VALIDAR QUE NO ESTÉ VENDIDO
        // ==========================================
        if (equipo.ventaAsociada && equipo.fechaVenta) {
            return res.status(400).json({
                ok: false,
                message: 'No se puede editar un equipo que ya ha sido vendido'
            });
        }

        // ==========================================
        // VALIDAR PRECIOS (solo stock)
        // ==========================================
        if (equipo.origen === 'stock' && (precioCompra !== undefined || precioVenta !== undefined)) {
            let nuevoPrecioCompra = precioCompra !== undefined ? precioCompra : equipo.precioCompra;
            let nuevoPrecioVenta = precioVenta !== undefined ? precioVenta : equipo.precioVenta;

            if (precioCompra !== undefined && precioCompra <= 0) {
                return res.status(400).json({
                    ok: false,
                    message: 'El precio de compra debe ser mayor a 0'
                });
            }

            if (precioVenta !== undefined && precioVenta <= 0) {
                return res.status(400).json({
                    ok: false,
                    message: 'El precio de venta debe ser mayor a 0'
                });
            }

            if (nuevoPrecioVenta <= nuevoPrecioCompra) {
                return res.status(400).json({
                    ok: false,
                    message: `El precio de venta ($${nuevoPrecioVenta}) debe ser mayor al precio de compra ($${nuevoPrecioCompra})`
                });
            }
        }

        // ==========================================
        // VALIDAR IMEI (si se actualiza)
        // ==========================================
        if (imei && imei !== equipo.imei) {
            if (!/^\d{15}$/.test(imei)) {
                return res.status(400).json({
                    ok: false,
                    message: 'El IMEI debe tener 15 dígitos numéricos'
                });
            }

            const imeiExistente = await Equipos.findOne({
                imei: imei,
                _id: { $ne: id },
                disponible: true
            });

            if (imeiExistente) {
                return res.status(400).json({
                    ok: false,
                    message: `El IMEI ${imei} ya está registrado en otro equipo`
                });
            }
        }

        // ==========================================
        // ACTUALIZAR DATOS BÁSICOS
        // ==========================================
        const camposActualizados = {};

        if (nombre) {
            equipo.nombre = nombre.trim();
            camposActualizados.nombre = nombre.trim();
        }

        if (modelo !== undefined) {
            equipo.modelo = modelo?.trim() || '';
            camposActualizados.modelo = modelo?.trim() || '';
        }

        if (capacidad !== undefined) {
            equipo.capacidad = capacidad?.trim() || '';
            camposActualizados.capacidad = capacidad?.trim() || '';
        }

        if (imei) {
            equipo.imei = imei.trim();
            camposActualizados.imei = imei.trim();
        }

        if (color !== undefined) {
            equipo.color = color?.trim() || '';
            camposActualizados.color = color?.trim() || '';
        }

        if (bateria !== undefined) {
            equipo.bateria = bateria?.trim() || '';
            camposActualizados.bateria = bateria?.trim() || '';
        }

        if (localidad !== undefined) {
            equipo.localidad = localidad?.trim().toLowerCase() || '';
            camposActualizados.localidad = localidad?.trim().toLowerCase() || '';
        }

        if (estado) {
            equipo.estado = estado;
            camposActualizados.estado = estado;
        }

        if (precioCompra !== undefined && equipo.origen === 'stock') {
            equipo.precioCompra = precioCompra;
            camposActualizados.precioCompra = precioCompra;
        }

        if (precioVenta !== undefined && equipo.origen === 'stock') {
            equipo.precioVenta = precioVenta;
            camposActualizados.precioVenta = precioVenta;
        }

        if (valorTasado !== undefined && equipo.origen === 'canje') {
            equipo.valorTasado = valorTasado;
            camposActualizados.valorTasado = valorTasado;
        }

        if (disponible !== undefined) {
            equipo.disponible = disponible;
            camposActualizados.disponible = disponible;
        }

        // ==========================================
        // ACTUALIZAR PROVEEDOR (solo stock)
        // ==========================================
        if (proveedor && equipo.origen === 'stock') {
            if (proveedor.nombre !== undefined) {
                equipo.proveedor.nombre = proveedor.nombre?.trim() || '';
            }
            if (proveedor.telefono !== undefined) {
                equipo.proveedor.telefono = proveedor.telefono?.trim() || '';
            }
            if (proveedor.email !== undefined) {
                equipo.proveedor.email = proveedor.email?.trim() || '';
            }
            if (proveedor.factura !== undefined) {
                equipo.proveedor.factura = proveedor.factura?.trim() || '';
            }
            camposActualizados.proveedor = equipo.proveedor;
        }

        // ==========================================
        // AGREGAR NOTA (si viene)
        // ==========================================
        if (agregarNota) {
            if (!agregarNota.texto) {
                return res.status(400).json({
                    ok: false,
                    message: 'El texto de la nota es obligatorio'
                });
            }

            equipo.notas.push({
                texto: agregarNota.texto,
                fecha: agregarNota.fecha || new Date(),
                usuario: {
                    nombre: agregarNota.usuario?.nombre || req.usuario?.nombre || 'Sistema'
                },
                tipo: agregarNota.tipo || 'general'
            });
            camposActualizados.notaAgregada = agregarNota.texto;
        }

        // ==========================================
        // REEMPLAZAR NOTAS COMPLETAS (si viene)
        // ==========================================
        if (notas && Array.isArray(notas)) {
            equipo.notas = notas.map(nota => ({
                texto: nota.texto,
                fecha: nota.fecha || new Date(),
                usuario: {
                    nombre: nota.usuario?.nombre || req.usuario?.nombre || 'Sistema'
                },
                tipo: nota.tipo || 'general'
            }));
            camposActualizados.notasReemplazadas = true;
        }

        // ==========================================
        // GUARDAR
        // ==========================================
        await equipo.save();

        return res.status(200).json({
            ok: true,
            message: 'Equipo actualizado exitosamente',
            data: equipo,
            cambios: camposActualizados
        });

    } catch (error) {
        console.error('Error al editar equipo:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                ok: false,
                message: 'Ya existe un equipo con ese IMEI en el sistema'
            });
        }

        return res.status(500).json({
            ok: false,
            message: `Error al editar equipo: ${error.message}`
        });
    }
};

// ==========================================
// 🔍 OBTENER EQUIPO POR ID
// ==========================================
const obtenerEquipoPorId = async (req, res) => {
    try {
        const { id } = req.params;

        const equipo = await Equipos.findById(id)
            .populate('ventaAsociada', 'cliente fechaRealizada tipoVenta')
            .populate('ventaOrigen', 'cliente fechaRealizada tipoVenta');

        if (!equipo) {
            return res.status(404).json({
                ok: false,
                message: 'Equipo no encontrado'
            });
        }

        return res.status(200).json({
            ok: true,
            data: equipo
        });

    } catch (error) {
        console.error('Error al obtener equipo:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al obtener equipo: ${error.message}`
        });
    }
};

// ==========================================
// 📋 LISTAR EQUIPOS (con filtros y paginación)
// ==========================================
const listarEquipos = async (req, res) => {
    try {
        const {
            origen,
            disponible,
            estado,
            nombre,
            modelo,
            capacidad,
            imei,
            localidad,
            desde,
            hasta,
            pagina = 1,
            limite = 50
        } = req.query;

        // ==========================================
        // CONSTRUIR FILTROS
        // ==========================================
        const filtros = {};

        if (origen && origen !== '') {
            filtros.origen = origen;
        }

        if (disponible !== undefined && disponible !== '') {
            filtros.disponible = disponible === 'true';
        }

        if (estado) {
            filtros.estado = estado;
        }

        if (nombre) {
            filtros.nombre = { $regex: nombre, $options: 'i' };
        }

        if (modelo) {
            filtros.modelo = { $regex: modelo, $options: 'i' };
        }

        if (capacidad) {
            filtros.capacidad = { $regex: capacidad, $options: 'i' };
        }

        if (imei) {
            filtros.imei = { $regex: imei, $options: 'i' };
        }

        if (localidad) {
            filtros.localidad = localidad.toLowerCase().trim();
        }

        if (desde && hasta) {
            filtros.fechaIngreso = {
                $gte: new Date(desde),
                $lte: new Date(hasta)
            };
        }

        // ==========================================
        // PAGINACIÓN
        // ==========================================
        const skip = (parseInt(pagina) - 1) * parseInt(limite);
        const limit = parseInt(limite);

        // ==========================================
        // CONSULTAR EQUIPOS (incluyendo notas)
        // ==========================================
        const [equipos, total] = await Promise.all([
            Equipos.find(filtros)
                .sort({ fechaIngreso: -1 })
                .skip(skip)
                .limit(limit)
                .populate({
                    path: 'ventaAsociada',
                    select: 'cliente.nombre cliente.apellido cliente.dni localidad tipoVenta fechaRealizada montoTotal montoPagado conducta_pago producto.nombre producto.modelo producto.capacidad'
                })
                .populate({
                    path: 'ventaOrigen',
                    select: 'cliente.nombre cliente.apellido cliente.dni localidad tipoVenta fechaRealizada montoTotal montoPagado conducta_pago producto.nombre producto.modelo producto.capacidad'
                })
                .lean(),
            Equipos.countDocuments(filtros)
        ]);

        // 👉 Formatear notas de cada equipo (fecha legible)
        const equiposConNotasFormateadas = equipos.map(equipo => ({
            ...equipo,
            notas: (equipo.notas || []).map(nota => ({
                texto: nota.texto,
                tipo: nota.tipo || 'general',
                fecha: nota.fecha,
                // 👉 Fecha formateada para el frontend
                fechaFormateada: nota.fecha 
                    ? new Date(nota.fecha).toLocaleDateString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })
                    : null,
                usuario: {
                    nombre: nota.usuario?.nombre || 'Sistema'
                }
            }))
        }));

        // ==========================================
        // CALCULAR TOTALES GENERALES (sin importar disponibilidad)
        // ==========================================
        const totalesGenerales = await Equipos.aggregate([
            { $match: filtros },
            {
                $group: {
                    _id: null,
                    totalStockCantidad: {
                        $sum: { $cond: [{ $eq: ['$origen', 'stock'] }, 1, 0] }
                    },
                    totalCanjeCantidad: {
                        $sum: { $cond: [{ $eq: ['$origen', 'canje'] }, 1, 0] }
                    },
                    totalCostoStock: {
                        $sum: { $cond: [{ $eq: ['$origen', 'stock'] }, '$precioCompra', 0] }
                    },
                    totalVentaStock: {
                        $sum: { $cond: [{ $eq: ['$origen', 'stock'] }, '$precioVenta', 0] }
                    },
                    totalTasadoCanje: {
                        $sum: { $cond: [{ $eq: ['$origen', 'canje'] }, '$valorTasado', 0] }
                    }
                }
            }
        ]);

        const totales = totalesGenerales[0] || {
            totalStockCantidad: 0,
            totalCanjeCantidad: 0,
            totalCostoStock: 0,
            totalVentaStock: 0,
            totalTasadoCanje: 0
        };

        totales.totalVentaGeneral = totales.totalVentaStock + totales.totalTasadoCanje;

        // ==========================================
        // RESUMEN DE DISPONIBLES
        // ==========================================
        const resumenDisponibles = await Equipos.aggregate([
            { $match: { ...filtros, disponible: true } },
            {
                $group: {
                    _id: '$origen',
                    cantidad: { $sum: 1 },
                    totalCompra: { $sum: '$precioCompra' },
                    totalVenta: { $sum: '$precioVenta' },
                    totalTasado: { $sum: '$valorTasado' }
                }
            }
        ]);

        const disponiblesStock = resumenDisponibles.find(r => r._id === 'stock') || { cantidad: 0, totalCompra: 0, totalVenta: 0 };
        const disponiblesCanje = resumenDisponibles.find(r => r._id === 'canje') || { cantidad: 0, totalTasado: 0 };

        // ==========================================
        // PAGINACIÓN
        // ==========================================
        const totalPaginas = Math.ceil(total / limit);
        const hayMas = parseInt(pagina) < totalPaginas;
        const restantes = Math.max(0, total - (parseInt(pagina) * limit));

        return res.status(200).json({
            ok: true,
            data: {
                equipos: equiposConNotasFormateadas,  // 👈 Equipos con notas formateadas
                paginacion: {
                    total,
                    pagina: parseInt(pagina),
                    limite: limit,
                    totalPaginas,
                    hayMas,
                    restantes
                },
                totales: {
                    totalStockCantidad: totales.totalStockCantidad || 0,
                    totalCanjeCantidad: totales.totalCanjeCantidad || 0,
                    totalCostoStock: totales.totalCostoStock || 0,
                    totalVentaStock: totales.totalVentaStock || 0,
                    totalTasadoCanje: totales.totalTasadoCanje || 0,
                    totalVentaGeneral: totales.totalVentaGeneral || 0,
                    stockDisponibleCantidad: disponiblesStock.cantidad || 0,
                    canjeDisponibleCantidad: disponiblesCanje.cantidad || 0,
                    gananciaPotencialStock: (disponiblesStock.totalVenta || 0) - (disponiblesStock.totalCompra || 0)
                },
                resumen: {
                    stock: {
                        cantidadDisponible: disponiblesStock.cantidad || 0,
                        valorTotalCompra: disponiblesStock.totalCompra || 0,
                        valorTotalVenta: disponiblesStock.totalVenta || 0,
                        gananciaPotencial: (disponiblesStock.totalVenta || 0) - (disponiblesStock.totalCompra || 0)
                    },
                    canje: {
                        cantidadDisponible: disponiblesCanje.cantidad || 0,
                        valorTotalTasado: disponiblesCanje.totalTasado || 0
                    }
                }
            }
        });

    } catch (error) {
        console.error('Error al listar equipos:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al listar equipos: ${error.message}`
        });
    }
};

// ==========================================
// 🗑️ ELIMINAR EQUIPO
// ==========================================
const eliminarEquipo = async (req, res) => {
    try {
        const { id } = req.params;

        const equipo = await Equipos.findById(id);

        if (!equipo) {
            return res.status(404).json({
                ok: false,
                message: 'Equipo no encontrado'
            });
        }

        if (equipo.ventaAsociada && equipo.fechaVenta) {
            return res.status(400).json({
                ok: false,
                message: 'No se puede eliminar un equipo que ya ha sido vendido'
            });
        }

        await equipo.deleteOne();

        return res.status(200).json({
            ok: true,
            message: 'Equipo eliminado exitosamente'
        });

    } catch (error) {
        console.error('Error al eliminar equipo:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al eliminar equipo: ${error.message}`
        });
    }
};

// ==========================================
// 📤 MARCAR COMO VENDIDO
// ==========================================
const marcarComoVendido = async (req, res) => {
    try {
        const { id } = req.params;
        const { idVenta } = req.body;

        if (!idVenta) {
            return res.status(400).json({
                ok: false,
                message: 'El ID de la venta es obligatorio'
            });
        }

        const equipo = await Equipo.findById(id);

        if (!equipo) {
            return res.status(404).json({
                ok: false,
                message: 'Equipo no encontrado'
            });
        }

        if (!equipo.disponible) {
            return res.status(400).json({
                ok: false,
                message: 'El equipo ya no está disponible'
            });
        }

        const venta = await Venta.findById(idVenta);

        if (!venta) {
            return res.status(404).json({
                ok: false,
                message: 'Venta no encontrada'
            });
        }

        equipo.disponible = false;
        equipo.fechaVenta = new Date();
        equipo.ventaAsociada = idVenta;

        equipo.notas.push({
            texto: `[VENTA ASOCIADA] Equipo vendido en venta #${idVenta} - Cliente: ${venta.cliente.nombre} ${venta.cliente.apellido}`,
            fecha: new Date(),
            usuario: {
                nombre: req.usuario?.nombre || 'Sistema'
            },
            tipo: 'importante'
        });

        await equipo.save();

        return res.status(200).json({
            ok: true,
            message: 'Equipo marcado como vendido exitosamente',
            data: equipo
        });

    } catch (error) {
        console.error('Error al marcar como vendido:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al marcar como vendido: ${error.message}`
        });
    }
};

// ==========================================
// 📥 REINGRESAR AL STOCK
// ==========================================
const reingresarEquipo = async (req, res) => {
    try {
        const { id } = req.params;

        const equipo = await Equipo.findById(id);

        if (!equipo) {
            return res.status(404).json({
                ok: false,
                message: 'Equipo no encontrado'
            });
        }

        if (equipo.disponible) {
            return res.status(400).json({
                ok: false,
                message: 'El equipo ya está disponible'
            });
        }

        equipo.disponible = true;
        equipo.fechaVenta = null;
        equipo.ventaAsociada = null;

        equipo.notas.push({
            texto: `[REINGRESO] Equipo reingresado por ${req.usuario?.nombre || 'Sistema'}`,
            fecha: new Date(),
            usuario: {
                nombre: req.usuario?.nombre || 'Sistema'
            },
            tipo: 'importante'
        });

        await equipo.save();

        return res.status(200).json({
            ok: true,
            message: 'Equipo reingresado exitosamente',
            data: equipo
        });

    } catch (error) {
        console.error('Error al reingresar equipo:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al reingresar equipo: ${error.message}`
        });
    }
};

// ==========================================
// EXPORTAR
// ==========================================
module.exports = {
    cargarEquipo,
    cargarEquipoCanje,
    editarEquipo,
    obtenerEquipoPorId,
    listarEquipos,
    eliminarEquipo,
    //marcarComoVendido,
    //reingresarEquipo
};