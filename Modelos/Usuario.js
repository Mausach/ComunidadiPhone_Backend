const { model, Schema } = require('mongoose');

const userSchema = new Schema({

    //DP= dato primario 
    //DS= dato secundario
    //DA= dato automatico 
    //DD= dato dinamico
    
    nombre: { //DP
        type: String,
        required: true,
        trim: true
    },  

    apellido: { //DP
        type: String,
        required: true,
        trim: true
    },  

    nombre_fam: { //DS
        type: String,
        trim: true
    },

    apellido_fam: { //DS
        type: String,
        trim: true
    },

    dni: { //DP
        type: String,
        required: true,
        unique: true
    },  

    cuil: { // DS
        type: String,
        unique: true,
        sparse: true // Ignora nulos/vacíos en la 
    },

    localidad: { //DP
        type: String,
        required: true,
        lowercase: true
    },  

   
    email: { //DP
        type: String,
        required: true,
        unique: true
    },  

    telefono: { //DP
        type: String,
        required: true
    },  

    telefonoSecundario: { //DS
        type: String
    },

    
    direccion: { //DS
        type: String,
        
    },

    direccionSecundaria: {//DS
        type: String
    },

    
    fechaIngreso: { //DA
        type: Date,
        default: Date.now
    },

    fechaSalida: { //DA
        type: Date
    },

    estado: { //DA
        type: Boolean,
        default: true //ture es habilitado
    },

    monotributo: { //DS
        type: Boolean,
        default: false //false es no tiene
    },

  
    password: { //DD
        type: String, 
        //a detectar si es string vacio y en front entrar a colocar la contraseña, ahi recien dejar pasar al sistema.
        
    },

    // === Roles y Jerarquía ===
    rol: { //DD
        type: String,
        enum: ["dev", "Admin", "ventas", "mkt", "serv_tec"],
        default: "vendedor"
    },

}, );

module.exports = model("Usuario", userSchema);