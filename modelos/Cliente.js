const { Schema, model } = require('mongoose');

const clienteSchema = new Schema({
    // === Identificación ===
    dni: {
        type: String,
        required: [true, 'El DNI es obligatorio'],
        unique: true,
        trim: true
    },
    
    cuil: {
        type: String,
        unique: true,
        sparse: true,  // Permite múltiples null sin conflicto
        trim: true,
       
    },
    
    // === Datos Personales ===
    nombre: {
        type: String,
        required: [true, 'El nombre es obligatorio'],
        trim: true
    },
    
    apellido: {
        type: String,
        required: [true, 'El apellido es obligatorio'],
        trim: true
    },
    
    // === Contacto ===
    telefono: {
        type: String,
        trim: true,
        default: null
    },
    
    email: {
        type: String,
        unique: true,
        sparse: true,  // Permite múltiples null sin conflicto
        lowercase: true,
        trim: true,
        
    },
    
    // === Ubicación ===
    direccion: {
        type: String,
        required: [true, 'La dirección es obligatoria'],
        trim: true
    },
    
    // === Scoring Crediticio ===
    situacionCrediticia: {
        type: Number,
        min: 1, 
        /*
        1-normal
        2-monitoreo atraso leve
        3-riesgo medio atraso de un mes
        4-riesgo alto ataso de 3 meses
        5-irrecuperable deudas en estado jucdicial
        */
        max: 5,
        default: null
    },
    
    // === Metadata ===
    activo: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,  // createdAt y updatedAt automáticos
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// === Virtuals ===
clienteSchema.virtual('nombreCompleto').get(function() {
    return `${this.nombre} ${this.apellido}`; //me permite mostrar nombre completo en ves de por separado
});

// === Índices para búsquedas frecuentes ===
clienteSchema.index({ apellido: 1, nombre: 1 });  // Búsqueda por nombre
clienteSchema.index({ activo: 1 });                // Filtro activos/inactivos

// === Exportación ===
module.exports = model('Cliente', clienteSchema);