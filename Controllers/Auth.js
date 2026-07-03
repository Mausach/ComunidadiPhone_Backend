const bcryptjs = require('bcrypt');
const jwt = require("jsonwebtoken");
const Usuario = require('../Modelos/Usuario');


// Login de primer acceso (solo email)
const loginPrimerAcceso = async (req, res) => {
    const { email } = req.body;

    try {
        if (!email || !email.trim()) {
            return res.status(400).json({
                ok: false,
                msg: "El email es obligatorio"
            });
        }

        const user = await Usuario.findOne({
            email: email.toLowerCase().trim()
        });

        if (!user) {
            return res.status(200).json({
                ok: true,
                msg: "Si el email está registrado, recibirás acceso para configurar tu cuenta"
            });
        }

        if (!user.estado) {
            return res.status(403).json({
                ok: false,
                msg: "Usuario inhabilitado. Contacte al administrador"
            });
        }

        if (user.password && user.password.trim() !== '') {
            return res.status(400).json({
                ok: false,
                msg: "Esta cuenta ya fue configurada. Use el login normal"
            });
        }

        const payload = {
            id: user._id,
            email: user.email,
            nombre: user.nombre,
            rol: user.rol,
            tipo: "setup",
            accion: "configurar_password"
        };

        const tokenSetup = jwt.sign(
            payload,
            process.env.SECRET_JWT,
            { expiresIn: "24h" }
        );

        res.status(200).json({
            ok: true,
            msg: "Acceso concedido para configuración inicial",
            token: tokenSetup,
            usuario: {
                id: user._id,
                nombre: user.nombre,
                apellido: user.apellido,
                email: user.email,
                rol: user.rol
            },
            requiereConfiguracion: true,
            proximoPaso: "configurar_password"
        });

    } catch (error) {
        console.error('Error en login de primer acceso:', error);
        res.status(500).json({
            ok: false,
            msg: "Error interno. Contacte al administrador"
        });
    }
};

// Login normal (con contraseña) - ACTUALIZADO
const loginUsuario = async (req, res) => {
    const { email, password } = req.body;

    try {
        // 1. Validar campos obligatorios
        if (!email || !password) {
            return res.status(400).json({
                ok: false,
                msg: "Email y contraseña son obligatorios"
            });
        }

        // 2. Buscar usuario por email
        const user = await Usuario.findOne({
            email: email.toLowerCase().trim()
        });

        if (!user) {
            return res.status(400).json({
                ok: false,
                msg: "Email o contraseña inválida"
            });
        }

        // 3. Verificar si el usuario tiene contraseña configurada
        if (!user.password || user.password.trim() === '') {
            return res.status(400).json({
                ok: false,
                msg: "Debe realizar la configuración inicial de su cuenta",
                requiereConfiguracion: true,
                redirigirA: "/primer-acceso"
            });
        }

        // 4. Validar contraseña
        const validPassword = bcryptjs.compareSync(password, user.password);
        if (!validPassword) {
            return res.status(400).json({
                ok: false,
                msg: "Email o contraseña inválida"
            });
        }

        // 5. Validar estado
        if (!user.estado) {
            return res.status(403).json({
                ok: false,
                msg: "Usuario inhabilitado. Contacte al administrador"
            });
        }

        // 6. Generar JWT normal de autenticación
        const payload = {
            id: user._id,
            nombre: user.nombre,
            apellido: user.apellido,
            email: user.email,
            rol: user.rol,
            tipo: "auth" // Token de autenticación completa
        };

        const token = jwt.sign(payload, process.env.SECRET_JWT, {
            expiresIn: "6h",
        });

        // 7. Respuesta exitosa
        res.status(200).json({
            ok: true,
            msg: "Inicio de sesión exitoso",
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
        console.error('Error en login:', error);
        res.status(500).json({
            ok: false,
            msg: "Error interno. Contacte al administrador"
        });
    }
};

// Ruta para configurar contraseña (protegida con token de setup)
const configurarPasswordInicial = async (req, res) => {
    const { password } = req.body;
    const userId = req.usuario.id; // Viene del middleware verificarTokenSetup

    try {
        // Validar que la contraseña no esté vacía
        if (!password || password.trim() === '') {
            return res.status(400).json({
                ok: false,
                msg: "La contraseña es obligatoria"
            });
        }

        // Encriptar y guardar
        const salt = bcryptjs.genSaltSync(10);
        const hashedPassword = bcryptjs.hashSync(password, salt);

        await Usuario.findByIdAndUpdate(userId, {
            password: hashedPassword
        });

        res.status(200).json({
            ok: true,
            msg: "Contraseña configurada exitosamente. Ya puede iniciar sesión normalmente"
        });

    } catch (error) {
        console.error('Error al configurar password:', error);
        res.status(500).json({
            ok: false,
            msg: "Error al configurar la contraseña"
        });
    }
};

module.exports = {
    loginUsuario,
    loginPrimerAcceso,
    configurarPasswordInicial

};