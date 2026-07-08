import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { TareasHijoPageRoutingModule } from './tareas-hijo-routing.module';

import { TareasHijoPage } from './tareas-hijo.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TareasHijoPageRoutingModule
  ],
  declarations: [TareasHijoPage]
})
export class TareasHijoPageModule {}
