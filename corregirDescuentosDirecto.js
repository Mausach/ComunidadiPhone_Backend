// ==========================================
// SCRIPT DE CORRECCIÓN DIRECTA DE DESCUENTOS
// ==========================================
// Uso: node corregirDescuentosDirecto.js
// ⚠️ Se ejecuta directamente SIN confirmación
// ==========================================

require('dotenv').config();
const mongoose = require('mongoose');
const Venta = require('./modelos/Venta');

// ==========================================
// LISTA DE CORRECCIONES (IDs + MONTO)
// ==========================================
const correcciones = [
    { idVenta: '6aa0accd03ddbade3e9b1b80', montoDescuento: 20000 },
    { idVenta: '6aadbf7cff762f4ad105a62f', montoDescuento: 50000 },
    { idVenta: '6aadbc39ff762f4ad105a614', montoDescuento: 20000 },
    { idVenta: '6ab598a3ad1d127cef1c403b', montoDescuento: 50000 },
    { idVenta: '6aadbde9ff762f4ad105a622', montoDescuento: 10000 },
    { idVenta: '6aadc090ff762f4ad105a633', montoDescuento: 50000 },
    { idVenta: '6ab3d0a11dc5a3745959ba63', montoDescuento: 50000 },
    { idVenta: '6ab59955ad1d127cef1c403f', montoDescuento: 50000 }
];

const NOMBRE_USUARIO = 'Corrección Automática';
const DESCRIPCION_DESCUENTO = 'Descuento omitido - corrección administrativa';

// ==========================================
// FUNCIÓN PRINCIPAL
// ==========================================
const main = async () => {
    console.log('\n🚀 CORRECCIÓN DIRECTA DE DESCUENTOS');
    console.log('==============================================\n');

    try {
        // Conectar
        await mongoose.connect(process.env.DB_CNN);
        console.log('✅ Base de datos conectada\n');

        let corregidas = 0;
        let omitidas = 0;
        let errores = 0;

        // Procesar cada corrección
        for (const correccion of correcciones) {
            try {
                const venta = await Venta.findById(correccion.idVenta);

                // No existe
                if (!venta) {
                    console.log(`❌ ${correccion.idVenta}: NO ENCONTRADA`);
                    omitidas++;
                    continue;
                }

                // Ya tiene descuentos
                const totalDescuentosExistentes = (venta.descuentos || [])
                    .reduce((sum, d) => sum + d.monto, 0);

                if (totalDescuentosExistentes > 0) {
                    console.log(`⏭️  ${correccion.idVenta}: YA TIENE DESCUENTOS ($${totalDescuentosExistentes.toLocaleString()})`);
                    omitidas++;
                    continue;
                }

                // Descuento inválido
                if (correccion.montoDescuento >= venta.montoTotal) {
                    console.log(`❌ ${correccion.idVenta}: DESCUENTO INVÁLIDO`);
                    omitidas++;
                    continue;
                }

                // Valores anteriores
                const montoTotalAnterior = venta.montoTotal;
                const montoPagadoActual = venta.montoPagado || 0;
                const fechaArgentina = new Date(new Date().toLocaleString('en-US', {
                    timeZone: 'America/Argentina/Buenos_Aires'
                }));

                // 1. Agregar descuento
                venta.descuentos.push({
                    monto: correccion.montoDescuento,
                    descripcion: DESCRIPCION_DESCUENTO,
                    fecha: fechaArgentina,
                    usuario: {
                        nombre: NOMBRE_USUARIO
                    }
                });

                // 2. Ajustar montoTotal
                venta.montoTotal = venta.montoTotal - correccion.montoDescuento;

                // 3. Agregar nota de trazabilidad
                venta.notas.push({
                    texto: `[CORRECCIÓN DESCUENTO] Se agregó descuento omitido por $${correccion.montoDescuento.toLocaleString()}. Monto total anterior: $${montoTotalAnterior.toLocaleString()} → nuevo: $${venta.montoTotal.toLocaleString()}.`,
                    fecha: fechaArgentina,
                    tipo: 'importante',
                    usuario: {
                        nombre: NOMBRE_USUARIO
                    }
                });

                // 4. Guardar
                await venta.save();

                corregidas++;
                console.log(`✅ ${venta.cliente?.nombre || ''} ${venta.cliente?.apellido || ''}: $${montoTotalAnterior.toLocaleString()} → $${venta.montoTotal.toLocaleString()} (descuento: $${correccion.montoDescuento.toLocaleString()})`);

            } catch (error) {
                errores++;
                console.error(`❌ ${correccion.idVenta}: ERROR - ${error.message}`);
            }
        }

        // Resumen
        console.log('\n==============================================');
        console.log('📊 RESUMEN FINAL:');
        console.log(`   ✅ Corregidas: ${corregidas}`);
        console.log(`   ⏭️  Omitidas: ${omitidas}`);
        console.log(`   ❌ Errores: ${errores}`);
        console.log(`   📊 Total procesadas: ${correcciones.length}`);
        console.log('==============================================\n');

        await mongoose.connection.close();
        console.log('✅ Script finalizado.\n');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error general:', error);
        process.exit(1);
    }
};

// Ejecutar
main();