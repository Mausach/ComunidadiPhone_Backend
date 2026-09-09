// ==========================================
// SCRIPT DE MIGRACIÓN: Stock + EquipoCanje → Equipo
// ==========================================
// Uso: node migrarEquipos.js
// ==========================================

require('dotenv').config();
const mongoose = require('mongoose');

//const Stock = require('./modelos/Stock');
//const EquipoCanje = require('./modelos/EquipoCanje');
//const Equipo = require('./modelos/Equipo');
const EquipoStock = require('./modelos/EquipoStock');
const Equipos = require('./modelos/Equipos');
const EqupoCanjes = require('./modelos/EqupoCanjes');

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
// MIGRAR STOCK → EQUIPO
// ==========================================
const migrarStock = async () => {
    console.log('\n🔄 Iniciando migración de STOCK...');
    
    // Leer TODOS los equipos de stock (disponibles y no disponibles)
    const stock = await EquipoStock.find().lean();
    console.log(`📊 Encontrados ${stock.length} equipos de stock`);

    let migrados = 0;
    let errores = 0;

    for (const equipo of stock) {
        try {
            // Verificar si ya existe en Equipo (por IMEI)
            if (equipo.imei) {
                const existente = await Equipos.findOne({ imei: equipo.imei });
                if (existente) {
                    console.log(`⏭️  Equipo con IMEI ${equipo.imei} ya existe, se omite`);
                    continue;
                }
            }

            // Crear nuevo equipo con origen 'stock'
            const nuevoEquipo = new Equipos({
                origen: 'stock',
                nombre: equipo.nombre,
                modelo: equipo.modelo || '',
                capacidad: '',  // No existía en stock
                imei: equipo.imei || '',
                color: equipo.color || '',
                bateria: equipo.bateria || '',
                localidad: equipo.localidad || '',
                estado: equipo.estado || 'sellado',
                precioCompra: equipo.precioCompra || 0,
                precioVenta: equipo.precioVenta || 0,
                valorTasado: 0,  // No aplica
                proveedor: equipo.proveedor || {},
                fechaIngreso: equipo.fechaIngreso || new Date(),
                fechaRecepcion: null,  // No aplica
                fechaVenta: equipo.fechaVenta || null,
                disponible: equipo.disponible !== undefined ? equipo.disponible : true,
                ventaOrigen: null,  // No aplica
                ventaAsociada: equipo.ventaAsociada || null,
                notas: (equipo.notas || []).map(nota => ({
                    texto: nota.texto,
                    fecha: nota.fecha || new Date(),
                    usuario: { nombre: nota.usuario?.nombre || 'Sistema' },
                    tipo: nota.tipo || 'general'
                })),
                createdAt: equipo.createdAt || new Date(),
                updatedAt: equipo.updatedAt || new Date()
            });

            await nuevoEquipo.save();
            migrados++;
            console.log(`✅ Migrado: ${equipo.nombre} (${equipo.imei || 'sin IMEI'})`);
        } catch (error) {
            errores++;
            console.error(`❌ Error al migrar ${equipo.nombre}:`, error.message);
        }
    }

    console.log(`\n📊 Stock migrado: ${migrados} exitosos, ${errores} errores`);
    return { migrados, errores };
};

// ==========================================
// MIGRAR EQUIPO CANJE → EQUIPO
// ==========================================
const migrarCanjes = async () => {
    console.log('\n🔄 Iniciando migración de EQUIPOS CANJE...');
    
    // Leer TODOS los equipos de canje (activos e inactivos)
    const canjes = await EqupoCanjes.find().lean();
    console.log(`📊 Encontrados ${canjes.length} equipos de canje`);

    let migrados = 0;
    let errores = 0;

    for (const equipo of canjes) {
        try {
            // Verificar si ya existe en Equipo (por IMEI)
            if (equipo.imei) {
                const existente = await Equipos.findOne({ imei: equipo.imei });
                if (existente) {
                    console.log(`⏭️  Equipo con IMEI ${equipo.imei} ya existe, se omite`);
                    continue;
                }
            }

            // Crear nuevo equipo con origen 'canje'
            const nuevoEquipo = new Equipos({
                origen: 'canje',
                ventaOrigen: equipo.ventaOrigen || null,
                nombre: equipo.nombre,
                modelo: equipo.modelo || '',
                capacidad: '',  // No existía en canje
                imei: equipo.imei || '',
                color: equipo.color || '',
                bateria: equipo.bateria || '',
                localidad: equipo.localidad || '',
                estado: equipo.estado || 'bueno',
                precioCompra: 0,  // No aplica
                precioVenta: 0,  // No aplica
                valorTasado: equipo.valorTasado || 0,
                proveedor: {},  // No aplica
                fechaIngreso: equipo.createdAt || equipo.fechaRecepcion || new Date(),
                fechaRecepcion: equipo.fechaRecepcion || null,
                fechaVenta: null,  // No aplica
                disponible: equipo.activo !== undefined ? equipo.activo : true,
                ventaAsociada: null,  // No aplica
                notas: (equipo.notas || []).map(nota => ({
                    texto: nota.texto,
                    fecha: nota.fecha || new Date(),
                    usuario: { nombre: nota.usuario?.nombre || 'Sistema' },
                    tipo: 'general'  // El canje original no tenía tipo
                })),
                createdAt: equipo.createdAt || new Date(),
                updatedAt: equipo.updatedAt || new Date()
            });

            await nuevoEquipo.save();
            migrados++;
            console.log(`✅ Migrado: ${equipo.nombre} (${equipo.imei || 'sin IMEI'})`);
        } catch (error) {
            errores++;
            console.error(`❌ Error al migrar ${equipo.nombre}:`, error.message);
        }
    }

    console.log(`\n📊 Canjes migrados: ${migrados} exitosos, ${errores} errores`);
    return { migrados, errores };
};

// ==========================================
// FUNCIÓN PRINCIPAL
// ==========================================
const main = async () => {
    console.log('🚀 Iniciando migración de equipos...');
    console.log('==============================================\n');

    await conectarDB();

    // Preguntar confirmación
    console.log('\n⚠️  ADVERTENCIA:');
    console.log('Este script migrará TODOS los equipos de Stock y EquipoCanje al nuevo modelo Equipo.');
    console.log('Los datos originales NO se borrarán.');
    console.log('Si ya ejecutaste este script antes, los datos se duplicarán.\n');

    // Ejecutar migraciones
    const resultadoStock = await migrarStock();
    const resultadoCanjes = await migrarCanjes();

    console.log('\n==============================================');
    console.log('📊 RESULTADO FINAL:');
    console.log(`   Stock migrado: ${resultadoStock.migrados} exitosos, ${resultadoStock.errores} errores`);
    console.log(`   Canjes migrados: ${resultadoCanjes.migrados} exitosos, ${resultadoCanjes.errores} errores`);
    console.log(`   Total: ${resultadoStock.migrados + resultadoCanjes.migrados} equipos migrados`);
    console.log('==============================================\n');

    // Cerrar conexión
    await mongoose.connection.close();
    console.log('✅ Conexión cerrada. Migración completada.');
    process.exit(0);
};

// Ejecutar
main().catch(error => {
    console.error('❌ Error general:', error);
    process.exit(1);
});