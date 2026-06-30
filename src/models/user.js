import mongoose from "mongoose";
import { email, lowercase, trim } from "zod";
import { required } from "zod/mini";

const userShema = new mongoose.Schema(
    {
    name: {
        type: String,
        required: true,
        trim: true
    },
    email:{
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password:{
        type: String,
        required: true,
    },
    avatarColor:{
        type: String,
        default: "#2a8b7b"
    }
        },
    {timestamps: true}    
);

export default mongoose.model('User', userShema);
