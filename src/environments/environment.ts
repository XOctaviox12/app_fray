export const environment = {
  production: false,
  
  // BD de producción (activa)
  supabaseUrl: 'https://uhgfamoypjnkvbyqgqsu.supabase.co',
  supabaseKey: 'sb_publishable_se23xbte24gox5L6_nN89g_1M7LR45U',

  // BD de prueba — descomentar y comentar el bloque de arriba para probar contra ella
  // supabaseUrl: 'https://fduvwczwhqwpkcunjcxv.supabase.co',
  // supabaseKey: 'sb_publishable_J2aDXAcPAo8NXfTZCAr4Mw_w7ekAj26',
  // Solo cloud_name + upload_preset (unsigned). NUNCA pongas aquí el API_SECRET
  // de Cloudinary: este archivo se compila dentro de la app y cualquiera con
  // el .apk/.js podría extraerlo. Un preset "unsigned" es seguro para esto.
  cloudinaryCloudName: 'ddogc3cnw',
  cloudinaryUploadPreset: 'ml_default', // TODO: reemplazar por el preset real
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
