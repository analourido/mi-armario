import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig({plugins:[react(),VitePWA({registerType:'autoUpdate',manifest:{name:'Mi Vestidor',short_name:'Vestidor',description:'Tu armario personal, en orden',theme_color:'#111111',background_color:'#FAFAF8',display:'standalone',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml'}]}})]})
