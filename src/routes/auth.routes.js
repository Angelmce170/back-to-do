import { Router } from "express";
import {register, login, me, updateProfile} from '../controllers/auth.controller.js';
import {auth} from '../middleware/auth.js';


const router = Router();

router.post('/register', register);//Registro de usuario
router.post('/login', login);//Login de usuario
router.get('/me', auth, me);//Perfil del usuario
router.put('/me', auth, updateProfile);//Actualizar perfil del usuario

export default router;
