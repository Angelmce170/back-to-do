import mongoose from "mongoose";
import { type } from "node:os";
import { title } from "node:process";
import { required } from "zod/mini";

const taskShema = new mongoose.Schema(
    {
        user:{ type: mongoose.Schema.Types.ObjectId, ref:'User', required: true},
        title:{
            type: String,
            required: true,
            trim: true
        },
        description:{
            type: String,
            trim: true,
            default: ""
        },
        status:{
            type: String,
            enum:['Pendiente', 'En proceso', 'Completada'],
            default:'Pendiente',
        },
        clienteId:{
            type: String,
        },
        deleted:{
            type: Boolean,
            default: false
        },
        },
        {timestamps: true}
);

export default mongoose.model('Task', taskShema);