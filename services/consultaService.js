// servicios/consultaService.js
const Venta = require('../modelos/Venta');
//const Cliente = require('../modelos/Cliente');

const Cliente = require("../modelos/Cliente");

// Función real para buscar cliente (la que ya probamos)
const buscarClientePorDNI = async (dni) => {
    const cliente = await Cliente.findOne({ dni }).lean();
    if (!cliente) return null;
    return {
        nombre: cliente.nombre,
        apellido: cliente.apellido,
        dni: cliente.dni,
        telefono: cliente.telefono,
        situacionCrediticia: cliente.situacionCrediticia
    };
};

// NUEVA FUNCIÓN REAL: Consultar deuda de un cliente
const consultarDeudaCliente = async (dni) => {
    // Buscamos todas las ventas activas del cliente con cuotas pendientes
    const ventas = await Venta.find({
        'cliente.dni': dni,
        estado: true,
        conducta_pago: { $ne: 'cancelado' } // Ignoramos las que ya están 100% pagadas
    }).lean();

    if (!ventas || ventas.length === 0) {
        return null; // No tiene ventas activas o no existe
    }

    let totalDeuda = 0;
    let cuotasPendientesCount = 0;
    const detalleVentas = [];

    for (const venta of ventas) {
        // Calculamos lo pendiente de ESTA venta sumando las cuotas no pagadas
        const cuotasPendientes = (venta.cuotas || []).filter(c => c.estado_cuota !== 'pagada');
        
        if (cuotasPendientes.length > 0) {
            const montoPendienteVenta = cuotasPendientes.reduce((sum, c) => {
                const recargos = (c.recargos || []).reduce((s, r) => s + r.monto, 0);
                return sum + (c.montoCuota + recargos) - (c.montoPagado || 0);
            }, 0);

            totalDeuda += montoPendienteVenta;
            cuotasPendientesCount += cuotasPendientes.length;

            detalleVentas.push({
                numeroContrato: venta.numeroContrato || 'S/N',
                tipoVenta: venta.tipoVenta,
                montoPendiente: montoPendienteVenta,
                cuotasPendientes: cuotasPendientes.length,
                conductaPago: venta.conducta_pago
            });
        }
    }

    return {
        dni,
        totalDeuda: totalDeuda,
        cuotasPendientesTotales: cuotasPendientesCount,
        detalleVentas
    };
};

module.exports = {
    buscarClientePorDNI,
    consultarDeudaCliente
};