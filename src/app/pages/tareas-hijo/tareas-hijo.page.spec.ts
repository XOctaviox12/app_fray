import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TareasHijoPage } from './tareas-hijo.page';

describe('TareasHijoPage', () => {
  let component: TareasHijoPage;
  let fixture: ComponentFixture<TareasHijoPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TareasHijoPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
