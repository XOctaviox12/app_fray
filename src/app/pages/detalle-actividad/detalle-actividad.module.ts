import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { DetalleActividadPageRoutingModule } from './detalle-actividad-routing.module';

import { DetalleActividadPage } from './detalle-actividad.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DetalleActividadPageRoutingModule,
    DetalleActividadPage   // ← standalone: se importa, no se declara
  ]
})
export class DetalleActividadPageModule {}
