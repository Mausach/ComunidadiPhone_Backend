const Venta = require("../Modelos/Venta");


const controlarEstadoCuotas = async () => {
    try {
        console.log('🕐 Iniciando control automático de cuotas...');
        const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
        const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

        // 1. Buscar todas las ventas activas con cuotas
        const ventas = await Venta.find({
            estado: true,
            frecuenciaCuota: { $ne: null },
            conducta_pago: { $nin: ['cancelado', 'caducado'] }
        });

        let ventasActualizadas = 0;
        let cuotasActualizadas = 0;

        for (const venta of ventas) {
            let huboCambios = false;
            let cuotasModificadas = false;

            // 2. Revisar cada cuota
            for (const cuota of venta.cuotas) {
                const fechaCobro = new Date(cuota.fechaCobro);
                const fechaCobroSolo = new Date(fechaCobro.getFullYear(), fechaCobro.getMonth(), fechaCobro.getDate());

                // Si la fecha de cobro ya pasó y sigue pendiente
                if (fechaCobroSolo < hoy && cuota.estado_cuota === 'pendiente') {
                    cuota.estado_cuota = 'no pagada';
                    cuota.notas.push({
                        texto: `Cuota marcada automáticamente como "no pagada" por vencimiento (${ahora.toLocaleDateString('es-AR')})`,
                        fecha: ahora,
                        usuario: { nombre: 'Sistema Automático' }
                    });
                    cuotasModificadas = true;
                    cuotasActualizadas++;
                }
            }

            // 3. Si hubo cambios en las cuotas, recalcular conducta de pago
            if (cuotasModificadas) {
                const cantidadNoPagadas = venta.cuotas.filter(c => c.estado_cuota === 'no pagada').length;
                const conductaAnterior = venta.conducta_pago;
                let nuevaConducta;

                if (cantidadNoPagadas === 0) {
                    nuevaConducta = 'al dia';
                } else if (cantidadNoPagadas === 1) {
                    nuevaConducta = 'atrasado';
                } else if (cantidadNoPagadas === 2) {
                    nuevaConducta = 'cobro judicial';
                } else {
                    nuevaConducta = 'caducado';
                }

                venta.conducta_pago = nuevaConducta;
                huboCambios = true;

                // Agregar nota si cambió la conducta
                if (conductaAnterior !== nuevaConducta) {
                    venta.notas.push({
                        texto: `Conducta de pago cambiada de "${conductaAnterior}" a "${nuevaConducta}" por sistema. Cuotas no pagadas: ${cantidadNoPagadas}`,
                        fecha: ahora,
                        tipo: 'importante',
                        usuario: { nombre: 'Sistema Automático' }
                    });
                }
            }

            // 4. Guardar si hubo cambios
            if (huboCambios) {
                await venta.save();
                ventasActualizadas++;
            }
        }

        console.log(`✅ Control completado: ${ventasActualizadas} ventas actualizadas, ${cuotasActualizadas} cuotas modificadas`);
        
        return {
            ok: true,
            ventasActualizadas,
            cuotasActualizadas
        };

    } catch (error) {
        console.error('❌ Error en control de cuotas:', error);
        return {
            ok: false,
            error: error.message
        };
    }
};

module.exports = {
    controlarEstadoCuotas
};