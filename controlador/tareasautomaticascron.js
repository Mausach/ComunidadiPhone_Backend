// controlador/CronActualizacion.js

const Venta = require("../modelos/Venta");



// ==========================================
// 🔄 ACTUALIZAR CUOTAS VENCIDAS (CRON)
// ==========================================
const actualizarCuotasVencidas = async (req, res) => {
    try {
        console.log('🔄 [CRON] Iniciando actualización de cuotas vencidas...');
        
        const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
        hoy.setHours(0, 0, 0, 0);

        const MONTO_POR_DIA = 4000;
        const LIMITE_DIAS_JUDICIAL = 60;

        // ==========================================
        // BUSCAR VENTAS ACTIVAS CON CUOTAS
        // ==========================================
        const ventas = await Venta.find({
            estado: true,
            cuotas: { $exists: true, $ne: [] },
            frecuenciaCuota: { $ne: null },  // 👉 Solo ventas con cuotas
            conducta_pago: { $ne: 'cobro judicial' }  // 👉 Excluir las que ya están en judicial
        });

        let cuotasVencidas = 0;
        let recargosActualizados = 0;
        let ventasActualizadas = 0;
        let ventasPasadasAJudicial = 0;

        for (const venta of ventas) {
            let ventaModificada = false;

            for (const cuota of venta.cuotas) {
                // Solo cuotas no pagadas
                if (cuota.estado_cuota === 'pagada') continue;

                const fechaCobro = new Date(cuota.fechaCobro);
                fechaCobro.setHours(0, 0, 0, 0);

                // Si no está vencida, continuar
                if (fechaCobro >= hoy) continue;

                const diasAtraso = Math.ceil((hoy - fechaCobro) / (1000 * 60 * 60 * 24));

                // ==========================================
                // 1. Si está "pendiente" y venció → "no pagada"
                // ==========================================
                if (cuota.estado_cuota === 'pendiente') {
                    cuota.estado_cuota = 'no pagada';
                    cuotasVencidas++;
                    ventaModificada = true;

                    cuota.notas.push({
                        texto: `[VENCIMIENTO] Cuota vencida hace ${diasAtraso} días. Estado cambiado a "no pagada".`,
                        fecha: new Date(),
                        usuario: { nombre: 'Sistema' }
                    });
                }

                // ==========================================
                // 2. Si ya superó los 60 días → NO agregar recargos
                //    (se maneja como cobro judicial)
                // ==========================================
                if (diasAtraso >= LIMITE_DIAS_JUDICIAL) {
                    continue;
                }

                // ==========================================
                // 3. Calcular recargo (solo si < 60 días y no es judicial)
                // ==========================================
                if (cuota.estado_cuota === 'no pagada') {
                    const recargoCalculado = diasAtraso * MONTO_POR_DIA;

                    // Calcular total de recargos existentes
                    const totalRecargosActual = cuota.recargos.reduce((total, r) => total + r.monto, 0);

                    // Solo actualizar si cambió
                    if (totalRecargosActual !== recargoCalculado) {
                        // Si no hay recargos, crear uno
                        if (cuota.recargos.length === 0) {
                            cuota.recargos.push({
                                monto: recargoCalculado,
                                motivo: `Atraso ${diasAtraso} días × $${MONTO_POR_DIA}`,
                                fecha: new Date(),
                                diasAtraso,
                                porcentajeAplicado: 0,
                                usuario: { nombre: 'Sistema' }
                            });
                            recargosActualizados++;
                            ventaModificada = true;
                        } else {
                            // Buscar si el último recargo es automático
                            const ultimoRecargo = cuota.recargos[cuota.recargos.length - 1];
                            
                            if (ultimoRecargo.usuario.nombre === 'Sistema') {
                                // Actualizar el recargo automático
                                ultimoRecargo.monto = recargoCalculado;
                                ultimoRecargo.motivo = `Atraso ${diasAtraso} días × $${MONTO_POR_DIA}`;
                                ultimoRecargo.fecha = new Date();
                                ultimoRecargo.diasAtraso = diasAtraso;
                                recargosActualizados++;
                                ventaModificada = true;
                            } else {
                                // Si el último fue manual, crear uno nuevo con la diferencia
                                const diferencia = recargoCalculado - totalRecargosActual;
                                if (diferencia > 0) {
                                    cuota.recargos.push({
                                        monto: diferencia,
                                        motivo: `Ajuste automático: atraso ${diasAtraso} días × $${MONTO_POR_DIA}`,
                                        fecha: new Date(),
                                        diasAtraso,
                                        porcentajeAplicado: 0,
                                        usuario: { nombre: 'Sistema' }
                                    });
                                    recargosActualizados++;
                                    ventaModificada = true;
                                }
                            }
                        }
                    }
                }
            }

            // ==========================================
            // 4. Actualizar conducta de pago
            // ==========================================
            if (ventaModificada) {
                const cuotasNoPagadas = venta.cuotas.filter(c => 
                    c.estado_cuota === 'no pagada'
                ).length;

                // Verificar si alguna cuota superó los 60 días
                const cuotasConAtrasoMayor60 = venta.cuotas.filter(c => {
                    if (c.estado_cuota === 'pagada') return false;
                    const fecha = new Date(c.fechaCobro);
                    fecha.setHours(0, 0, 0, 0);
                    const dias = Math.ceil((hoy - fecha) / (1000 * 60 * 60 * 24));
                    return dias >= LIMITE_DIAS_JUDICIAL;
                }).length;

                if (cuotasConAtrasoMayor60 > 0) {
                    venta.conducta_pago = 'cobro judicial';
                    ventasPasadasAJudicial++;
                } else if (cuotasNoPagadas >= 4) {
                    venta.conducta_pago = 'caducado';
                } else if (cuotasNoPagadas >= 1) {
                    venta.conducta_pago = 'atrasado';
                }

                await venta.save();
                ventasActualizadas++;
            }
        }

        const resultado = {
            ok: true,
            cuotasVencidas,
            recargosActualizados,
            ventasActualizadas,
            ventasPasadasAJudicial
        };

        console.log(`✅ [CRON] Completado: ${cuotasVencidas} cuotas vencidas, ${recargosActualizados} recargos, ${ventasActualizadas} ventas, ${ventasPasadasAJudicial} a judicial`);

        return res.status(200).json({
            ok: true,
            message: 'Actualización de cuotas completada',
            data: resultado
        });

    } catch (error) {
        console.error('❌ [CRON] Error:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al actualizar cuotas: ${error.message}`
        });
    }
};

// ==========================================
// 📊 OBTENER ESTADO DE CUOTAS VENCIDAS (para debug)
// ==========================================
const obtenerEstadoCuotas = async (req, res) => {
    try {
        const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
        hoy.setHours(0, 0, 0, 0);

        const ventas = await Venta.find({
            estado: true,
            cuotas: { $exists: true, $ne: [] }
        }).select('cliente cuotas conducta_pago');

        const cuotasVencidas = [];

        for (const venta of ventas) {
            for (const cuota of venta.cuotas) {
                if (cuota.estado_cuota === 'pagada') continue;

                const fechaCobro = new Date(cuota.fechaCobro);
                fechaCobro.setHours(0, 0, 0, 0);

                if (fechaCobro < hoy) {
                    const diasAtraso = Math.ceil((hoy - fechaCobro) / (1000 * 60 * 60 * 24));
                    cuotasVencidas.push({
                        ventaId: venta._id,
                        cliente: venta.cliente.nombre + ' ' + venta.cliente.apellido,
                        numeroCuota: cuota.numeroCuota,
                        montoCuota: cuota.montoCuota,
                        estadoCuota: cuota.estado_cuota,
                        fechaCobro: cuota.fechaCobro,
                        diasAtraso,
                        recargos: cuota.recargos.reduce((total, r) => total + r.monto, 0)
                    });
                }
            }
        }

        return res.status(200).json({
            ok: true,
            totalCuotasVencidas: cuotasVencidas.length,
            cuotas: cuotasVencidas
        });

    } catch (error) {
        console.error('Error al obtener estado de cuotas:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al obtener estado: ${error.message}`
        });
    }
};

module.exports = {
    actualizarCuotasVencidas,
    obtenerEstadoCuotas
};