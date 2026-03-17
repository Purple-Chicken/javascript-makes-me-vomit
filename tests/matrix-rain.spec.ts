import { startMatrixRain } from '../src/lib/matrixRain.ts';

describe('matrix rain utility', () => {
  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).requestAnimationFrame;
  });

  it('returns early when canvas is missing', () => {
    (globalThis as any).document = {
      getElementById: () => null,
    };
    (globalThis as any).window = {
      addEventListener: jasmine.createSpy('addEventListener'),
      innerWidth: 1280,
      innerHeight: 720,
    };
    (globalThis as any).requestAnimationFrame = jasmine.createSpy('raf');

    startMatrixRain('missing-canvas');

    expect((globalThis as any).requestAnimationFrame).not.toHaveBeenCalled();
    expect((globalThis as any).window.addEventListener).not.toHaveBeenCalled();
  });

  it('returns early when canvas context is unavailable', () => {
    const canvas = {
      getContext: () => null,
    };
    (globalThis as any).document = {
      getElementById: () => canvas,
    };
    (globalThis as any).window = {
      addEventListener: jasmine.createSpy('addEventListener'),
      innerWidth: 1280,
      innerHeight: 720,
    };
    (globalThis as any).requestAnimationFrame = jasmine.createSpy('raf');

    startMatrixRain();

    expect((globalThis as any).requestAnimationFrame).not.toHaveBeenCalled();
    expect((globalThis as any).window.addEventListener).not.toHaveBeenCalled();
  });

  it('registers resize handler and schedules animation when initialized', () => {
    const fillRect = jasmine.createSpy('fillRect');
    const fillText = jasmine.createSpy('fillText');
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        font: '',
        textBaseline: '',
        fillRect,
        fillText,
      }),
    };
    const addEventListener = jasmine.createSpy('addEventListener');
    const requestAnimationFrame = jasmine
      .createSpy('requestAnimationFrame')
      .and.returnValue(1);

    (globalThis as any).document = {
      getElementById: () => canvas,
    };
    (globalThis as any).window = {
      addEventListener,
      innerWidth: 1024,
      innerHeight: 768,
    };
    (globalThis as any).requestAnimationFrame = requestAnimationFrame;

    startMatrixRain();

    expect(addEventListener).toHaveBeenCalledWith('resize', jasmine.any(Function));
    expect(requestAnimationFrame).toHaveBeenCalled();
    expect(canvas.width).toBe(1024);
    expect(canvas.height).toBe(768);
  });
});
