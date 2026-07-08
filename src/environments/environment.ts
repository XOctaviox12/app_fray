// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

// src/environments/environment.ts
export const environment = {
  production: false,
  supabaseUrl: 'https://fduvwczwhqwpkcunjcxv.supabase.co',
  supabaseKey: 'sb_publishable_J2aDXAcPAo8NXfTZCAr4Mw_w7ekAj26',
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
