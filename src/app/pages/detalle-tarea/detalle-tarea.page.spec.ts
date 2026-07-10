import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DetalleTareaPage } from './detalle-tarea.page';

describe('DetalleTareaPage', () => {
  let component: DetalleTareaPage;
  let fixture: ComponentFixture<DetalleTareaPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(DetalleTareaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
