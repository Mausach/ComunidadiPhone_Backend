const bcryptjs = require('bcrypt');
const jwt = require("jsonwebtoken");
const Usuario = require('../Modelos/Usuario');


// Crear usuario empleado
const crearUsuario = async (req, res) => {
    const { 
        nombre, 
        apellido,
        email, 
        //password, 
        rol, 
        telefono,
        localidad, 
        dni,
    } = req.body;

    try {
        // Validar campos obligatorios según el modelo (DP y password)
        if (!nombre || !apellido || !email || !telefono || !localidad || !dni) {
            return res.status(400).json({
                ok: false,
                msg: "Faltan campos obligatorios: nombre, apellido, email, password, telefono, localidad, DNI"
            });
        }

        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                ok: false,
                msg: "El formato del email no es válido"
            });
        }

        // Verificar si ya existe un usuario con ese DNI
        let user = await Usuario.findOne({ dni });
        if (user) {
            return res.status(400).json({
                ok: false,
                msg: "Ya existe un usuario con ese DNI"
            });
        }

        // Verificar si ya existe un usuario con ese email
        user = await Usuario.findOne({ email: email.toLowerCase() });
        if (user) {
            return res.status(400).json({
                ok: false,
                msg: "Ya existe un usuario con ese email"
            });
        }

        // Crear nuevo usuario con los datos del modelo
        user = new Usuario({
            nombre,
            apellido,
            nombre_fam: undefined,
            apellido_fam: undefined,
            dni,
            cuil: undefined,
            localidad: localidad.toLowerCase(),
            email: email.toLowerCase(),
            telefono,
            telefonoSecundario: undefined,
            direccion: undefined,
            direccionSecundaria:  undefined,
            //password, // Se encriptará abajo
            rol: rol || "ventas",
            monotributo: false,
            estado: true,
            fechaIngreso: new Date()
        });

        // Encriptar contraseña
        //const salt = bcryptjs.genSaltSync(10);
        //user.password = bcryptjs.hashSync(password, salt);

        // Guardar usuario
        await user.save();

        // Generar JWT
        const payload = {
            id: user._id,
            nombre: user.nombre,
            apellido: user.apellido,
            rol: user.rol,
        };

        const token = jwt.sign(payload, process.env.SECRET_JWT, {
            expiresIn: "2h",
        });

        // Respuesta exitosa con el token
        res.status(201).json({
            ok: true,
            msg: 'Usuario creado correctamente',
            token,
            usuario: {
                id: user._id,
                nombre: user.nombre,
                apellido: user.apellido,
                email: user.email,
                rol: user.rol,
                localidad: user.localidad
            }
        });

    } catch (error) {
        console.error('Error al crear usuario:', error);
        
        // Manejar error de duplicados de MongoDB
        if (error.code === 11000) {
            const campo = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                ok: false,
                msg: `Ya existe un usuario con ese ${campo}`
            });
        }
        
        res.status(500).json({
            ok: false,
            msg: "Error interno del servidor. Por favor contacte al administrador"
        });
    }
};

// Modifica datos personales del usuario empleado
const actualizarUsuario = async (req, res) => {
    const { _id } = req.body; // Obtener el ID del cuerpo de la solicitud
    
    try {
        // 1. Verificar existencia
        const usuario = await Usuario.findById(_id);
        if (!usuario) {
            return res.status(404).json({ 
                ok: false, 
                msg: "Usuario no encontrado" 
            });
        }

        // 2. Extraer campos editables (solo los que existen en el modelo)
        const { 
            nombre, 
            apellido, 
            email,
            direccion, 
            direccionSecundaria, 
            telefono,
            telefonoSecundario, 
            localidad, 
            dni, 
            cuil,
            monotributo, 
            fechaSalida, 
            rol,
            nombre_fam, 
            apellido_fam 
        } = req.body;

        // 3. Construir objeto de actualización solo con campos proporcionados
        const updates = {};
        
        if (nombre !== undefined) updates.nombre = nombre;
        if (apellido !== undefined) updates.apellido = apellido;
        if (email !== undefined) updates.email = email.toLowerCase();
        if (direccion !== undefined) updates.direccion = direccion;
        if (direccionSecundaria !== undefined) updates.direccionSecundaria = direccionSecundaria;
        if (telefono !== undefined) updates.telefono = telefono;
        if (telefonoSecundario !== undefined) updates.telefonoSecundario = telefonoSecundario;
        if (localidad !== undefined) updates.localidad = localidad.toLowerCase();
        if (dni !== undefined) updates.dni = dni;
        if (cuil !== undefined) updates.cuil = cuil;
        if (monotributo !== undefined) updates.monotributo = monotributo;
        if (fechaSalida !== undefined) updates.fechaSalida = fechaSalida;
        if (rol !== undefined) updates.rol = rol;
        if (nombre_fam !== undefined) updates.nombre_fam = nombre_fam;
        if (apellido_fam !== undefined) updates.apellido_fam = apellido_fam;

        // 4. Validar unicidad solo si cambian email o dni
        if (updates.email && updates.email !== usuario.email) {
            const existeEmail = await Usuario.findOne({ 
                email: updates.email, 
                _id: { $ne: _id } 
            });
            if (existeEmail) {
                return res.status(400).json({ 
                    ok: false, 
                    msg: "El email ya está en uso por otro usuario" 
                });
            }
        }
        
        if (updates.dni && updates.dni !== usuario.dni) {
            const existeDni = await Usuario.findOne({ 
                dni: updates.dni, 
                _id: { $ne: _id } 
            });
            if (existeDni) {
                return res.status(400).json({ 
                    ok: false, 
                    msg: "El DNI ya está en uso por otro usuario" 
                });
            }
        }

        // 5. Validar rol si se modifica (roles de tu modelo)
        const rolesPermitidos = ["dev", "ger_com", "ceo", "admin", "ventas", "cobranza", "mkt", "serv_tec"];
        if (updates.rol && !rolesPermitidos.includes(updates.rol)) {
            return res.status(400).json({ 
                ok: false, 
                msg: `Rol no válido. Roles permitidos: ${rolesPermitidos.join(', ')}` 
            });
        }

        // 6. Si se marca fechaSalida, automáticamente cambiar estado a false
        if (updates.fechaSalida) {
            updates.estado = false;
        }

        // 7. Actualizar usuario
        const usuarioActualizado = await Usuario.findByIdAndUpdate(
            _id, 
            updates, 
            { 
                new: true,
                select: '-password -__v' // Excluir campos sensibles
            }
        );

        res.json({
            ok: true,
            msg: 'Usuario actualizado correctamente',
            usuario: usuarioActualizado,
            camposActualizados: Object.keys(updates)
        });

    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        
        // Manejar error de duplicados de MongoDB
        if (error.code === 11000) {
            const campo = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                ok: false,
                msg: `Ya existe un usuario con ese ${campo}`
            });
        }
        
        res.status(500).json({ 
            ok: false, 
            msg: "Error interno del servidor. Por favor contacte al administrador"
        });
    }
};


// Cargar usuarios
const cargarUsuarios = async (req, res) => {
    try {
        // Obtener todos los usuarios (podés filtrar por rol si necesitás)
        const usuarios = await Usuario.find()
            .select('-password -__v')
            .lean();

        // Función segura para formatear fechas
        const formatFechaArg = (fecha) => {
            if (!fecha || !(fecha instanceof Date)) return undefined;
            return fecha.toLocaleDateString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        };

        // Formatear datos para el frontend
        const usuariosFormateados = usuarios.map(usuario => {
            const usuarioFormateado = { ...usuario };

            // Formatear fechas del usuario
            if (usuario.fechaIngreso) {
                usuarioFormateado.fechaIngreso = formatFechaArg(new Date(usuario.fechaIngreso));
            }
            if (usuario.fechaSalida) {
                usuarioFormateado.fechaSalida = formatFechaArg(new Date(usuario.fechaSalida));
            }

            return usuarioFormateado;
        });

        // Contar por roles para estadísticas
        const estadisticas = {
            total: usuarios.length,
            activos: usuarios.filter(u => u.estado === true).length,
            inactivos: usuarios.filter(u => u.estado === false).length,
            porRol: {
                dev: usuarios.filter(u => u.rol === 'dev').length,
                Admin: usuarios.filter(u => u.rol === 'Admin').length,
                ventas: usuarios.filter(u => u.rol === 'ventas').length,
                mkt: usuarios.filter(u => u.rol === 'mkt').length,
                serv_tec: usuarios.filter(u => u.rol === 'serv_tec').length
            }
        };

        res.status(200).json({
            ok: true,
            msg: "Usuarios cargados exitosamente",
            usuarios: usuariosFormateados,
            estadisticas
        });

    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        res.status(500).json({
            ok: false,
            msg: "Error interno. Por favor contacte al administrador"
        });
    }
};

// Cambiar estado de usuario
const CambiarEstadoUsuario = async (req, res) => {
    try {
        const { _id } = req.body;

        // 1. Buscar usuario por ID
        const usuario = await Usuario.findById(_id);

        // 2. Verificar existencia
        if (!usuario) {
            return res.status(404).json({
                ok: false,
                msg: 'No existe ningún usuario con este ID',
            });
        }

        // 3. Alternar estado (true → false, false → true)
        usuario.estado = !usuario.estado;

        // 4. Guardar cambios
        await usuario.save();

        // 5. Respuesta con nuevo estado
        res.status(200).json({
            ok: true,
            msg: usuario.estado 
                ? 'Usuario habilitado correctamente' 
                : 'Usuario deshabilitado correctamente',
            usuario: {
                _id: usuario._id,
                nombre: usuario.nombre,
                apellido: usuario.apellido,
                estado: usuario.estado
            }
        });

    } catch (error) {
        console.error('Error al cambiar estado del usuario:', error);
        
        // Manejar error de ID inválido
        if (error.kind === 'ObjectId') {
            return res.status(400).json({
                ok: false,
                msg: 'ID de usuario no válido'
            });
        }
        
        res.status(500).json({
            ok: false,
            msg: 'Error interno. Por favor contacte al administrador',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    crearUsuario,
    actualizarUsuario,
    cargarUsuarios,
    CambiarEstadoUsuario,

};