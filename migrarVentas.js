// ==========================================
// SCRIPT DE MIGRACIÓN: Agregar campos nuevos a Ventas
// ==========================================
// Uso: node migrarVentas.js
// ==========================================

require('dotenv').config();
const mongoose = require('mongoose');
const Venta = require('./modelos/Venta');

// ==========================================
// CONEXIÓN A LA BASE DE DATOS
// ==========================================
const conectarDB = async () => {
    try {
        await mongoose.connect(process.env.DB_CNN);
        console.log('✅ Base de datos conectada');
    } catch (error) {
        console.error('❌ Error al conectar a la base de datos:', error.message);
        process.exit(1);
    }
};

// ==========================================
// MIGRACIÓN DE VENTAS
// ==========================================
const migrarVentas = async () => {
    console.log('\n🔄 Iniciando migración de ventas...\n');

    // Traer TODAS las ventas (activas e inactivas)
    const ventas = await Venta.find({});
    console.log(`📊 Total de ventas encontradas: ${ventas.length}\n`);

    let ventasActualizadas = 0;
    let ventasSinCambios = 0;
    let errores = 0;

    const detalleErrores = [];

    for (const venta of ventas) {
        try {
            let necesitaActualizar = false;
            const cambios = [];

            // ==========================================
            // 1. AGREGAR DOCUMENTACION (si falta)
            // ==========================================
            if (!venta.documentacion || venta.documentacion === undefined) {
                venta.documentacion = {
                    urlCarpeta: null,
                    fechaSubida: null,
                    subidoPor: null,
                    notas: null
                };
                necesitaActualizar = true;
                cambios.push('documentacion');
            }

            // ==========================================
            // 2. AGREGAR garante.relacion y garante.ocupacion
            //    (solo si tiene garante y le faltan)
            // ==========================================
            if (venta.requiereGarante && venta.garante) {
                if (venta.garante.relacion === undefined) {
                    venta.garante.relacion = null;
                    necesitaActualizar = true;
                    cambios.push('garante.relacion');
                }

                if (venta.garante.ocupacion === undefined) {
                    venta.garante.ocupacion = null;
                    necesitaActualizar = true;
                    cambios.push('garante.ocupacion');
                }
            }

            // ==========================================
            // 3. GUARDAR SOLO SI HAY CAMBIOS
            // ==========================================
            if (necesitaActualizar) {
                await venta.save();
                ventasActualizadas++;
                console.log(`✅ Venta ${venta._id} actualizada: ${cambios.join(', ')}`);
            } else {
                ventasSinCambios++;
            }

        } catch (error) {
            errores++;
            detalleErrores.push({
                ventaId: venta._id,
                error: error.message
            });
            console.error(`❌ Error al migrar venta ${venta._id}:`, error.message);
        }
    }

    // ==========================================
    // RESUMEN FINAL
    // ==========================================
    console.log('\n==============================================');
    console.log('📊 RESUMEN DE MIGRACIÓN:');
    console.log(`   ✅ Ventas actualizadas: ${ventasActualizadas}`);
    console.log(`   ⏭️  Ventas sin cambios: ${ventasSinCambios}`);
    console.log(`   ❌ Errores: ${errores}`);
    console.log(`   📊 Total: ${ventas.length}`);
    console.log('==============================================\n');

    if (errores > 0) {
        console.log('⚠️  Detalle de errores:');
        detalleErrores.forEach(e => {
            console.log(`   - ${e.ventaId}: ${e.error}`);
        });
    }

    return { ventasActualizadas, ventasSinCambios, errores };
};

// ==========================================
// VERIFICACIÓN POST-MIGRACIÓN
// ==========================================
const verificarMigracion = async () => {
    console.log('\n🔍 Verificando migración...\n');

    const total = await Venta.countDocuments();

    const sinDocumentacion = await Venta.countDocuments({
        $or: [
            { documentacion: { $exists: false } },
            { documentacion: null }
        ]
    });

    const conGaranteSinRelacion = await Venta.countDocuments({
        requiereGarante: true,
        'garante.relacion': { $exists: false }
    });

    const conGaranteSinOcupacion = await Venta.countDocuments({
        requiereGarante: true,
        'garante.ocupacion': { $exists: false }
    });

    console.log('📊 Estado post-migración:');
    console.log(`   Total ventas: ${total}`);
    console.log(`   Sin documentacion: ${sinDocumentacion} ${sinDocumentacion === 0 ? '✅' : '⚠️'}`);
    console.log(`   Con garante sin relacion: ${conGaranteSinRelacion} ${conGaranteSinRelacion === 0 ? '✅' : '⚠️'}`);
    console.log(`   Con garante sin ocupacion: ${conGaranteSinOcupacion} ${conGaranteSinOcupacion === 0 ? '✅' : '⚠️'}`);

    if (sinDocumentacion === 0 && conGaranteSinRelacion === 0 && conGaranteSinOcupacion === 0) {
        console.log('\n✅ MIGRACIÓN COMPLETADA EXITOSAMENTE\n');
    } else {
        console.log('\n⚠️  Hay ventas pendientes. Revisá los errores.\n');
    }
};

// ==========================================
// FUNCIÓN PRINCIPAL
// ==========================================
const main = async () => {
    console.log('🚀 Iniciando script de migración de ventas...');
    console.log('==============================================');
    console.log('⚠️  IMPORTANTE:');
    console.log('   - NO se elimina ningún dato existente');
    console.log('   - NO se reemplazan campos existentes');
    console.log('   - SOLO se agregan campos nuevos que faltan');
    console.log('==============================================\n');

    await conectarDB();

    const resultado = await migrarVentas();

    await verificarMigracion();

    await mongoose.connection.close();
    console.log('✅ Conexión cerrada. Script finalizado.\n');
    process.exit(0);
};

// Ejecutar
main().catch(error => {
    console.error('❌ Error general:', error);
    process.exit(1);
});