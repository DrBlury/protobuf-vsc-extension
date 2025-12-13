import { SaveStateTracker } from '../saveState';

describe('SaveStateTracker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('marks and clears documents immediately', () => {
    const tracker = new SaveStateTracker();
    const uri = 'file:///tmp/example.proto';

    tracker.mark(uri);
    expect(tracker.isSaving(uri)).toBe(true);

    tracker.clear(uri);
    expect(tracker.isSaving(uri)).toBe(false);
  });

  it('automatically clears documents after timeout', () => {
    const tracker = new SaveStateTracker(5000);
    const uri = 'file:///tmp/example.proto';

    tracker.mark(uri);
    expect(tracker.isSaving(uri)).toBe(true);

    jest.advanceTimersByTime(5000);
    expect(tracker.isSaving(uri)).toBe(false);
  });

  it('resets timers when mark is called repeatedly', () => {
    const tracker = new SaveStateTracker(2000);
    const uri = 'file:///tmp/example.proto';

    tracker.mark(uri);
    jest.advanceTimersByTime(1500);
    expect(tracker.isSaving(uri)).toBe(true);

    tracker.mark(uri);
    jest.advanceTimersByTime(1500);
    // Still tracked because timer reset
    expect(tracker.isSaving(uri)).toBe(true);

    jest.advanceTimersByTime(2000);
    expect(tracker.isSaving(uri)).toBe(false);
  });

  it('ignores empty keys gracefully', () => {
    const tracker = new SaveStateTracker();
    tracker.mark('');
    tracker.clear(undefined);
    expect(tracker.isSaving('')).toBe(false);
  });

  it('disposes timers', () => {
    const tracker = new SaveStateTracker(10000);
    const uri = 'file:///tmp/example.proto';
    tracker.mark(uri);
    expect(tracker.isSaving(uri)).toBe(true);

    tracker.dispose();
    expect(tracker.isSaving(uri)).toBe(false);
  });
});
