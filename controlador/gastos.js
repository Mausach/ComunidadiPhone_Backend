const Gastos = require("../modelos/Gastos");


const cargarGastos = async (req, res) => {
    try {
        const gastos = await Gastos.find()
            .sort({ fecha: -1 }) // Ordenar por fecha descendente (más reciente primero)
            .lean();

        // Función segura para formatear fechas (solo si existe)
        const formatFechaArg = (fecha) => {
            if (!fecha || !(fecha instanceof Date)) return undefined;
            return fecha.toLocaleDateString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        };

        const gastosFormateados = gastos.map(gasto => {
            const gastoFormateado = { ...gasto };

            // Formatear fechas directas (solo si existen)
            if (gasto.fecha) {
                gastoFormateado.fecha = formatFechaArg(gasto.fecha);
            }
            if (gasto.createdAt) {
                gastoFormateado.createdAt = formatFechaArg(gasto.createdAt);
            }
            if (gasto.updatedAt) {
                gastoFormateado.updatedAt = formatFechaArg(gasto.updatedAt);
            }

            return gastoFormateado;
        });

        // Calcular total de gastos
        const total = gastos.reduce((sum, gasto) => sum + gasto.Monto_gasto, 0);

        res.status(200).json({
            ok: true,
            msg: "Gastos cargados exitosamente",
            gastos: gastosFormateados,
            total: total,
            count: gastos.length
        });

    } catch (error) {
        console.error('Error al cargar gastos:', error);
        res.status(500).json({
            ok: false,
            msg: "Error interno. Por favor contacte al administrador"
        });
    }
};

const crearGasto = async (req, res) => {
    try {
        const { descripcion_gasto, Monto_gasto,responsable } = req.body;

        // Validación básica (opcional)
        if (!descripcion_gasto || !Monto_gasto) {
            return res.status(400).json({ mensaje: 'Faltan campos obligatorios.' });
        }

        const nuevoGasto = new Gastos({
            descripcion_gasto,
            Monto_gasto,
            responsable,
            fecha: new Date() // Fecha actual del sistema
        });

        await nuevoGasto.save();

        res.status(201).json({
            mensaje: 'Gasto creado correctamente.',
            gasto: nuevoGasto
        });

    } catch (error) {
        console.error('Error al crear el gasto:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
};

module.exports = {

    cargarGastos,
    crearGasto

};