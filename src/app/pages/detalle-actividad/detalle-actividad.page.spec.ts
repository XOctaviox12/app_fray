import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DetalleActividadPage } from './detalle-actividad.page';

describe('DetalleActividadPage', () => {
  let component: DetalleActividadPage;
  let fixture: ComponentFixture<DetalleActividadPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(DetalleActividadPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
