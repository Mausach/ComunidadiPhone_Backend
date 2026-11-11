// servicios/ventasService.js
const Venta = require('../modelos/Venta'); // Ajustá la ruta si es necesario

const listarVentasCobranzaService = async (filtrosParams) => {
    const {
        dni,
        nombre,
        estado,
        fechaDesde,
        fechaHasta,
        fechaVentaDesde,
        fechaVentaHasta,
        localidad,
        tipoVenta,
        pagina = 1,
        limite = 20
    } = filtrosParams;

    // ==========================================
    // CONSTRUIR FILTROS
    // ==========================================
    const filtros = {
        estado: true,
        cuotas: { $exists: true, $ne: [] }
    };

    if (dni) filtros['cliente.dni'] = dni.trim();
    if (nombre) filtros['cliente.nombre'] = { $regex: nombre.trim(), $options: 'i' };
    if (estado) filtros.conducta_pago = estado;
    if (localidad) filtros.localidad = localidad.toLowerCase().trim();
    if (tipoVenta) filtros.tipoVenta = tipoVenta;

    if (fechaVentaDesde || fechaVentaHasta) {
        filtros.fechaRealizada = {};
        if (fechaVentaDesde) filtros.fechaRealizada.$gte = new Date(fechaVentaDesde + 'T00:00:00-03:00');
        if (fechaVentaHasta) filtros.fechaRealizada.$lte = new Date(fechaVentaHasta + 'T23:59:59-03:00');
    }

    if (fechaDesde || fechaHasta) {
        const condicionesFecha = {};
        if (fechaDesde) condicionesFecha.$gte = new Date(fechaDesde + 'T00:00:00-03:00');
        if (fechaHasta) condicionesFecha.$lte = new Date(fechaHasta + 'T23:59:59-03:00');
        filtros.cuotas = { $elemMatch: { fechaCobro: condicionesFecha } };
    }

    // ==========================================
    // PAGINACIÓN Y CONSULTA
    // ==========================================
    const skip = (parseInt(pagina) - 1) * parseInt(limite);
    const limit = parseInt(limite);

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
    // FORMATEAR RESPUESTA (Lógica pura)
    // ==========================================
    const ventasFormateadas = ventas.map(venta => {
        const cuotasPendientes = venta.cuotas.filter(c => c.estado_cuota === 'pendiente').length;
        const cuotasPagadas = venta.cuotas.filter(c => c.estado_cuota === 'pagada').length;
        const cuotasAtrasadas = venta.cuotas.filter(c => c.estado_cuota === 'no pagada').length;
        const totalCuotas = venta.cuotas.length;

        const montoPendiente = venta.cuotas
            .filter(c => c.estado_cuota !== 'pagada')
            .reduce((total, c) => {
                const totalRecargos = (c.recargos || []).reduce((s, r) => s + r.monto, 0);
                return total + ((c.montoCuota + totalRecargos) - (c.montoPagado || 0));
            }, 0);

        const montoPagadoCalculado = venta.cuotas.reduce((total, c) => total + (c.montoPagado || 0), 0);

        const hoy = new Date();
        const cuotaProxima = venta.cuotas
            .filter(c => c.estado_cuota === 'pendiente' || c.estado_cuota === 'pago parcial')
            .sort((a, b) => new Date(a.fechaCobro) - new Date(b.fechaCobro))[0];

        return {
            _id: venta._id,
            cliente: venta.cliente,
            producto: venta.producto,
            localidad: venta.localidad,
            tipoVenta: venta.tipoVenta,
            fechaRealizada: venta.fechaRealizada,
            montoTotal: venta.montoTotal,
            montoPagado: montoPagadoCalculado,
            montoPendiente,
            conducta_pago: venta.conducta_pago,
            cuotas: {
                total: totalCuotas,
                pagadas: cuotasPagadas,
                pendientes: cuotasPendientes,
                atrasadas: cuotasAtrasadas
            },
            proximaCuota: cuotaProxima ? {
                numeroCuota: cuotaProxima.numeroCuota,
                montoCuota: cuotaProxima.montoCuota,
                montoPagado: cuotaProxima.montoPagado || 0,
                fechaCobro: cuotaProxima.fechaCobro,
                diasRestantes: Math.ceil((new Date(cuotaProxima.fechaCobro) - hoy) / (1000 * 60 * 60 * 24))
            } : null
        };
    });

    return {
        ventas: ventasFormateadas,
        paginacion: {
            total,
            pagina: parseInt(pagina),
            limite: limit,
            paginas: Math.ceil(total / limit)
        }
    };
};

module.exports = {
    listarVentasCobranzaService
};