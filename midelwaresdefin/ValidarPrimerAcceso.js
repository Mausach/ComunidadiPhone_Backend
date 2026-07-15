const jwt = require('jsonwebtoken');

const verificarTokenSetup = (req, res, next) => {
    // Extraer el token del header 'x-token' (igual que validarJWTRolesSuperiores)
    const token = req.header('x-token');

    // Si no hay token, rechazar la petición
    if (!token) {
        return res.status(401).json({
            ok: false,
            msg: 'No hay token en la petición',
        });
    }

    try {
        // Verificar el token con la clave secreta
        const payload = jwt.verify(token, process.env.SECRET_JWT);

        // Solo permitir tokens de tipo 'setup'
        if (payload.tipo !== "setup") {
            return res.status(403).json({
                ok: false,
                msg: 'Acceso denegado: Se requiere token de configuración inicial.',
            });
        }

        // Si el token es válido, pasar los datos al controlador
        req.usuario = {
            id: payload.id,
            email: payload.email,
            nombre: payload.nombre,
            rol: payload.rol
        };

        next();
    } catch (error) {
        return res.status(401).json({
            ok: false,
            msg: 'Token no válido o expirado.',
        });
    }
};

module.exports = {
    verificarTokenSetup,
};