// controllers/stockController.js

const EquipoStock = require('../modelos/EquipoStock');
const Venta = require('../modelos/Venta');
const EqupoCanjes = require("../modelos/EqupoCanjes");

// ==========================================
//  CARGAR EQUIPO AL STOCK
// ==========================================
const cargarStock = async (req, res) => {
    try {
        const {
            nombre,
            modelo,
            imei,
            color,
            bateria,
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
            // Validar formato básico (15 dígitos)
            if (!/^\d{15}$/.test(imei)) {
                return res.status(400).json({
                    ok: false,
                    message: 'El IMEI debe tener 15 dígitos numéricos'
                });
            }

            // Verificar que no exista en stock
            const imeiExistente = await EquipoStock.findOne({ 
                imei: imei,
                disponible: true 
            });

            if (imeiExistente) {
                return res.status(400).json({
                    ok: false,
                    message: `El IMEI ${imei} ya está registrado en stock como "${imeiExistente.nombre}"`
                });
            }

            // Verificar que no exista en canjes activos
            
            const imeiEnCanje = await EqupoCanjes.findOne({
                imei: imei,
                activo: true
            });

            if (imeiEnCanje) {
                return res.status(400).json({
                    ok: false,
                    message: `El IMEI ${imei} ya está registrado como equipo en canje`
                });
            }
        }

        // ==========================================
        // PREPARAR DATOS
        // ==========================================
        const nuevoStock = new EquipoStock({
            nombre: nombre.trim(),
            modelo: modelo?.trim() || '',
            imei: imei?.trim() || '',
            color: color?.trim() || '',
            bateria: bateria?.trim() || '',
            estado: estado || 'sellado',
            precioCompra,
            precioVenta,
            proveedor: proveedor ? {
                nombre: proveedor.nombre?.trim() || '',
                telefono: proveedor.telefono?.trim() || '',
                email: proveedor.email?.trim() || '',
                factura: proveedor.factura?.trim() || ''
            } : {},
            fechaIngreso: fechaIngreso ? new Date(fechaIngreso) : new Date(),
            disponible: true,
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
        await nuevoStock.save();

        return res.status(201).json({
            ok: true,
            message: 'Equipo cargado al stock exitosamente',
            data: nuevoStock
        });

    } catch (error) {
        console.error('Error al cargar stock:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                ok: false,
                message: 'Ya existe un equipo con ese IMEI en el sistema'
            });
        }

        return res.status(500).json({
            ok: false,
            message: `Error al cargar stock: ${error.message}`
        });
    }
};

// ==========================================
//  EDITAR EQUIPO EN STOCK
// ==========================================
const editarStock = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            nombre,
            modelo,
            imei,
            color,
            bateria,
            estado,
            precioCompra,
            precioVenta,
            proveedor,
            disponible,
            notas,
            agregarNota
        } = req.body;

        // ==========================================
        // BUSCAR EQUIPO
        // ==========================================
        const stock = await EquipoStock.findById(id);

        if (!stock) {
            return res.status(404).json({
                ok: false,
                message: 'Equipo no encontrado en el stock'
            });
        }

        // ==========================================
        // VALIDAR QUE NO ESTÉ VENDIDO
        // ==========================================
        if (stock.ventaAsociada && stock.fechaVenta) {
            return res.status(400).json({
                ok: false,
                message: 'No se puede editar un equipo que ya ha sido vendido'
            });
        }

        // ==========================================
        // VALIDAR PRECIOS (si vienen)
        // ==========================================
        let nuevoPrecioCompra = precioCompra !== undefined ? precioCompra : stock.precioCompra;
        let nuevoPrecioVenta = precioVenta !== undefined ? precioVenta : stock.precioVenta;

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

        // ==========================================
        // VALIDAR IMEI (si se actualiza)
        // ==========================================
        if (imei && imei !== stock.imei) {
            if (!/^\d{15}$/.test(imei)) {
                return res.status(400).json({
                    ok: false,
                    message: 'El IMEI debe tener 15 dígitos numéricos'
                });
            }

            const imeiExistente = await EquipoStock.findOne({
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
            stock.nombre = nombre.trim();
            camposActualizados.nombre = nombre.trim();
        }

        if (modelo !== undefined) {
            stock.modelo = modelo?.trim() || '';
            camposActualizados.modelo = modelo?.trim() || '';
        }

        if (imei) {
            stock.imei = imei.trim();
            camposActualizados.imei = imei.trim();
        }

        if (color !== undefined) {
            stock.color = color?.trim() || '';
            camposActualizados.color = color?.trim() || '';
        }

        if (bateria !== undefined) {
            stock.bateria = bateria?.trim() || '';
            camposActualizados.bateria = bateria?.trim() || '';
        }

        if (estado) {
            stock.estado = estado;
            camposActualizados.estado = estado;
        }

        if (precioCompra !== undefined) {
            stock.precioCompra = precioCompra;
            camposActualizados.precioCompra = precioCompra;
        }

        if (precioVenta !== undefined) {
            stock.precioVenta = precioVenta;
            camposActualizados.precioVenta = precioVenta;
        }

        if (disponible !== undefined) {
            stock.disponible = disponible;
            camposActualizados.disponible = disponible;
        }

        // ==========================================
        // ACTUALIZAR PROVEEDOR
        // ==========================================
        if (proveedor) {
            if (proveedor.nombre !== undefined) {
                stock.proveedor.nombre = proveedor.nombre?.trim() || '';
            }
            if (proveedor.telefono !== undefined) {
                stock.proveedor.telefono = proveedor.telefono?.trim() || '';
            }
            if (proveedor.email !== undefined) {
                stock.proveedor.email = proveedor.email?.trim() || '';
            }
            if (proveedor.factura !== undefined) {
                stock.proveedor.factura = proveedor.factura?.trim() || '';
            }
            camposActualizados.proveedor = stock.proveedor;
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

            stock.notas.push({
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
            stock.notas = notas.map(nota => ({
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
        await stock.save();

        return res.status(200).json({
            ok: true,
            message: 'Stock actualizado exitosamente',
            data: stock,
            cambios: camposActualizados
        });

    } catch (error) {
        console.error('Error al editar stock:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                ok: false,
                message: 'Ya existe un equipo con ese IMEI en el sistema'
            });
        }

        return res.status(500).json({
            ok: false,
            message: `Error al editar stock: ${error.message}`
        });
    }
};

// ==========================================
//  OBTENER UN EQUIPO POR ID
// ==========================================
const obtenerStockPorId = async (req, res) => {
    try {
        const { id } = req.params;

        // CORREGIDO: EquipoStock en lugar de Stock
        const stock = await EquipoStock.findById(id)
            .populate('ventaAsociada', 'cliente fechaRealizada tipoVenta');

        if (!stock) {
            return res.status(404).json({
                ok: false,
                message: 'Equipo no encontrado en el stock'
            });
        }

        return res.status(200).json({
            ok: true,
            data: stock
        });

    } catch (error) {
        console.error('Error al obtener stock:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al obtener stock: ${error.message}`
        });
    }
};

// ==========================================
//  LISTAR STOCK (con filtros y paginación)
// ==========================================
const listarStock = async (req, res) => {
    try {
        const {
            disponible,
            estado,
            nombre,
            modelo,
            imei,
            desde,
            hasta,
            pagina = 1,
            limite = 20
        } = req.query;

        // ==========================================
        // CONSTRUIR FILTROS
        // ==========================================
        const filtros = {};

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

        if (imei) {
            filtros.imei = { $regex: imei, $options: 'i' };
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
        // CONSULTAR
        // ==========================================
        // CORREGIDO: EquipoStock en ambos
        const [equipos, total] = await Promise.all([
            EquipoStock.find(filtros)
                .sort({ fechaIngreso: -1 })
                .skip(skip)
                .limit(limit)
                .populate('ventaAsociada', 'cliente fechaRealizada tipoVenta'),
            EquipoStock.countDocuments(filtros)
        ]);

        // ==========================================
        // CALCULAR RESUMEN DEL STOCK
        // ==========================================
        // CORREGIDO: EquipoStock
        const resumen = await EquipoStock.aggregate([
            { $match: { disponible: true } },
            {
                $group: {
                    _id: null,
                    cantidad: { $sum: 1 },
                    totalCompra: { $sum: '$precioCompra' },
                    totalVenta: { $sum: '$precioVenta' }
                }
            }
        ]);

        const resumenStock = resumen[0] || { cantidad: 0, totalCompra: 0, totalVenta: 0 };

        return res.status(200).json({
            ok: true,
            data: {
                stock: equipos,
                paginacion: {
                    total,
                    pagina: parseInt(pagina),
                    limite: limit,
                    totalPaginas: Math.ceil(total / limit)
                },
                resumen: {
                    cantidadTotalDisponible: resumenStock.cantidad,
                    valorTotalCompra: resumenStock.totalCompra,
                    valorTotalVenta: resumenStock.totalVenta,
                    gananciaPotencial: resumenStock.totalVenta - resumenStock.totalCompra
                }
            }
        });

    } catch (error) {
        console.error('Error al listar stock:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al listar stock: ${error.message}`
        });
    }
};

// ==========================================
//  ELIMINAR STOCK
// ==========================================
const eliminarStock = async (req, res) => {
    try {
        const { id } = req.params;

        // CORREGIDO: EquipoStock
        const stock = await EquipoStock.findById(id);

        if (!stock) {
            return res.status(404).json({
                ok: false,
                message: 'Equipo no encontrado en el stock'
            });
        }

        if (stock.ventaAsociada && stock.fechaVenta) {
            return res.status(400).json({
                ok: false,
                message: 'No se puede eliminar un equipo que ya ha sido vendido'
            });
        }

        await stock.deleteOne();

        return res.status(200).json({
            ok: true,
            message: 'Equipo eliminado del stock exitosamente'
        });

    } catch (error) {
        console.error('Error al eliminar stock:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al eliminar stock: ${error.message}`
        });
    }
};

// ==========================================
//  MARCAR COMO VENDIDO
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

        // CORREGIDO: EquipoStock
        const stock = await EquipoStock.findById(id);

        if (!stock) {
            return res.status(404).json({
                ok: false,
                message: 'Equipo no encontrado en el stock'
            });
        }

        if (!stock.disponible) {
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

        stock.disponible = false;
        stock.fechaVenta = new Date();
        stock.ventaAsociada = idVenta;

        stock.notas.push({
            texto: `[VENTA ASOCIADA] Equipo vendido en venta #${idVenta} - Cliente: ${venta.cliente.nombre} ${venta.cliente.apellido}`,
            fecha: new Date(),
            usuario: {
                nombre: req.usuario?.nombre || 'Sistema'
            },
            tipo: 'importante'
        });

        await stock.save();

        return res.status(200).json({
            ok: true,
            message: 'Equipo marcado como vendido exitosamente',
            data: stock
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
//  REINGRESAR AL STOCK
// ==========================================
const reingresarAlStock = async (req, res) => {
    try {
        const { id } = req.params;

        // CORREGIDO: EquipoStock
        const stock = await EquipoStock.findById(id);

        if (!stock) {
            return res.status(404).json({
                ok: false,
                message: 'Equipo no encontrado en el stock'
            });
        }

        if (stock.disponible) {
            return res.status(400).json({
                ok: false,
                message: 'El equipo ya está disponible en el stock'
            });
        }

        stock.disponible = true;
        stock.fechaVenta = null;
        stock.ventaAsociada = null;

        stock.notas.push({
            texto: `[REINGRESO AL STOCK] Equipo reingresado al stock por ${req.usuario?.nombre || 'Sistema'}`,
            fecha: new Date(),
            usuario: {
                nombre: req.usuario?.nombre || 'Sistema'
            },
            tipo: 'importante'
        });

        await stock.save();

        return res.status(200).json({
            ok: true,
            message: 'Equipo reingresado al stock exitosamente',
            data: stock
        });

    } catch (error) {
        console.error('Error al reingresar al stock:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al reingresar al stock: ${error.message}`
        });
    }
};

// ==========================================
// EXPORTAR
// ==========================================
module.exports = {
    cargarStock,
    editarStock,
    obtenerStockPorId,
    listarStock,
    eliminarStock,
    marcarComoVendido,
    reingresarAlStock
};