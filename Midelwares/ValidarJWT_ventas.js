const jwt = require('jsonwebtoken');

const validarJWTVentas = (req, res, next) => {  
    // Extraer el token del header 'x-token'
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

        // Solo permitir 'creador', o 'admin'
        if (
            payload.rol !== "dev" && 
            payload.rol !== "ger_com"&& 
            payload.rol !== "ventas"
        ) {
            return res.status(403).json({  
                ok: false,
                msg: 'Acceso denegado: Solo usuarios con rol superiores pueden acceder.',
            });
        }

        // Si el token es válido y el rol es correcto, pasar los datos al controlador
        req.id = payload.id;
        req.name = payload.name;
        req.rol = payload.rol;

        next(); // Continuar con el siguiente middleware/ruta
    } catch (error) {
        // Si el token no es válido
        return res.status(401).json({
            ok: false,
            msg: 'Token no válido o expirado.',
        });
    }
};

module.exports = {
    validarJWTVentas,  // Exportar con el nuevo nombre
};