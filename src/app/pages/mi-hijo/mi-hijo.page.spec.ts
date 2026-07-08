import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MiHijoPage } from './mi-hijo.page';

describe('MiHijoPage', () => {
  let component: MiHijoPage;
  let fixture: ComponentFixture<MiHijoPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MiHijoPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
