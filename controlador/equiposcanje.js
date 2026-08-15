// controlador/EquipoCanje.js

const EquipoCanje = require('../modelos/EquipoCanje');
const Venta = require('../modelos/Venta');

// ==========================================
// 🔍 OBTENER EQUIPO CANJE POR ID
// ==========================================
const obtenerEquipoCanjePorId = async (req, res) => {
    try {
        const { id } = req.params;

        const equipo = await EquipoCanje.findById(id)
            .populate('ventaOrigen', 'cliente fechaRealizada tipoVenta localidad');

        if (!equipo) {
            return res.status(404).json({
                ok: false,
                message: 'Equipo canje no encontrado'
            });
        }

        return res.status(200).json({
            ok: true,
            data: equipo
        });

    } catch (error) {
        console.error('Error al obtener equipo canje:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al obtener equipo canje: ${error.message}`
        });
    }
};

// ==========================================
// 📋 LISTAR EQUIPOS CANJE (con filtros y paginación)
// ==========================================
const listarEquiposCanje = async (req, res) => {
    try {
        const {
            activo,
            estado,
            nombre,
            modelo,
            imei,
            localidad,
            desde,
            hasta,
            pagina = 1,
            limite = 20
        } = req.query;

        // ==========================================
        // CONSTRUIR FILTROS
        // ==========================================
        const filtros = {};

        if (activo !== undefined && activo !== '') {
            filtros.activo = activo === 'true';
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

        // 👉 NUEVO: Filtro por localidad
        if (localidad) {
            filtros.localidad = localidad.toLowerCase().trim();
        }

        if (desde && hasta) {
            filtros.fechaRecepcion = {
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
        const [equipos, total] = await Promise.all([
            EquipoCanje.find(filtros)
                .sort({ fechaRecepcion: -1 })
                .skip(skip)
                .limit(limit)
                .populate('ventaOrigen', 'cliente.nombre cliente.apellido cliente.dni localidad tipoVenta'),
            EquipoCanje.countDocuments(filtros)
        ]);

        // ==========================================
        // CALCULAR RESUMEN
        // ==========================================
        const resumen = await EquipoCanje.aggregate([
            { $match: { activo: true } },
            {
                $group: {
                    _id: null,
                    cantidad: { $sum: 1 },
                    valorTotalTasado: { $sum: '$valorTasado' },
                    valorPromedio: { $avg: '$valorTasado' }
                }
            }
        ]);

        const resumenCanjes = resumen[0] || { cantidad: 0, valorTotalTasado: 0, valorPromedio: 0 };

        return res.status(200).json({
            ok: true,
            data: {
                equipos,
                paginacion: {
                    total,
                    pagina: parseInt(pagina),
                    limite: limit,
                    totalPaginas: Math.ceil(total / limit)
                },
                resumen: {
                    cantidadActivos: resumenCanjes.cantidad,
                    valorTotalTasado: resumenCanjes.valorTotalTasado,
                    valorPromedioTasado: Math.round(resumenCanjes.valorPromedio || 0)
                }
            }
        });

    } catch (error) {
        console.error('Error al listar equipos canje:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al listar equipos canje: ${error.message}`
        });
    }
};

// ==========================================
// ✏️ EDITAR EQUIPO CANJE
// ==========================================
const editarEquipoCanje = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            nombre,
            modelo,
            imei,
            color,
            bateria,
            estado,
            localidad,  // 👉 NUEVO
            valorTasado,
            agregarNota
        } = req.body;

        // ==========================================
        // BUSCAR EQUIPO
        // ==========================================
        const equipo = await EquipoCanje.findById(id);

        if (!equipo) {
            return res.status(404).json({
                ok: false,
                message: 'Equipo canje no encontrado'
            });
        }

        // ==========================================
        // VALIDAR VALOR TASADO (si viene)
        // ==========================================
        if (valorTasado !== undefined && valorTasado <= 0) {
            return res.status(400).json({
                ok: false,
                message: 'El valor tasado debe ser mayor a 0'
            });
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

            const imeiExistente = await EquipoCanje.findOne({
                imei: imei,
                _id: { $ne: id },
                activo: true
            });

            if (imeiExistente) {
                return res.status(400).json({
                    ok: false,
                    message: `El IMEI ${imei} ya está registrado en otro equipo canje`
                });
            }
        }

        // ==========================================
        // ACTUALIZAR DATOS
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

        if (estado) {
            equipo.estado = estado;
            camposActualizados.estado = estado;
        }

        // 👉 NUEVO: Actualizar localidad
        if (localidad !== undefined) {
            equipo.localidad = localidad?.trim().toLowerCase() || '';
            camposActualizados.localidad = localidad?.trim().toLowerCase() || '';
        }

        if (valorTasado !== undefined) {
            equipo.valorTasado = valorTasado;
            camposActualizados.valorTasado = valorTasado;
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
                }
            });
            camposActualizados.notaAgregada = agregarNota.texto;
        }

        // ==========================================
        // GUARDAR
        // ==========================================
        await equipo.save();

        return res.status(200).json({
            ok: true,
            message: 'Equipo canje actualizado exitosamente',
            data: equipo,
            cambios: camposActualizados
        });

    } catch (error) {
        console.error('Error al editar equipo canje:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                ok: false,
                message: 'Ya existe un equipo canje con ese IMEI'
            });
        }

        return res.status(500).json({
            ok: false,
            message: `Error al editar equipo canje: ${error.message}`
        });
    }
};

// ==========================================
// 🔄 CAMBIAR DISPONIBILIDAD (activo/inactivo)
// ==========================================
const cambiarDisponibilidad = async (req, res) => {
    try {
        const { id } = req.params;
        const { activo } = req.body;

        if (activo === undefined) {
            return res.status(400).json({
                ok: false,
                message: 'El campo "activo" es obligatorio'
            });
        }

        const equipo = await EquipoCanje.findById(id);

        if (!equipo) {
            return res.status(404).json({
                ok: false,
                message: 'Equipo canje no encontrado'
            });
        }

        equipo.activo = activo;

        equipo.notas.push({
            texto: `[DISPONIBILIDAD] Cambiado a ${activo ? 'activo' : 'inactivo'} por ${req.usuario?.nombre || 'Sistema'}`,
            fecha: new Date(),
            usuario: {
                nombre: req.usuario?.nombre || 'Sistema'
            }
        });

        await equipo.save();

        return res.status(200).json({
            ok: true,
            message: `Equipo canje ${activo ? 'activado' : 'desactivado'} exitosamente`,
            data: equipo
        });

    } catch (error) {
        console.error('Error al cambiar disponibilidad:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al cambiar disponibilidad: ${error.message}`
        });
    }
};

// ==========================================
// EXPORTAR
// ==========================================
module.exports = {
    obtenerEquipoCanjePorId,
    listarEquiposCanje,
    editarEquipoCanje,
    cambiarDisponibilidad
};