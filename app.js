const STORAGE_KEYS = {
    totalRounds: 'japaTotalRounds'
};

const COUNTER_LIMIT = 108;
const ARM_THRESHOLD = 40;
const RESET_THRESHOLD = 10;

const state = {
    started: false,
    counter: 0,
    totalRounds: readStoredNumber(STORAGE_KEYS.totalRounds, 0),
    audioContext: null,
    baseline: null,
    axis: null,
    armed: false
};

const counterEl = document.getElementById('counter');
const roundsEl = document.getElementById('rounds');
const startBtn = document.getElementById('startBtn');
const statusEl = document.getElementById('status');

roundsEl.textContent = String(state.totalRounds);
setStatus('Press start to calibrate the sensor.');

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}

function readStoredNumber(key, fallback) {
    try {
        const storedValue = localStorage.getItem(key);
        if (storedValue === null) {
            return fallback;
        }

        const parsedValue = Number.parseInt(storedValue, 10);
        return Number.isNaN(parsedValue) ? fallback : parsedValue;
    } catch {
        return fallback;
    }
}

function writeStoredNumber(key, value) {
    try {
        localStorage.setItem(key, String(value));
    } catch {
        // Storage can fail in private browsing; keep the session running.
    }
}

function setStatus(message) {
    statusEl.textContent = message;
}

async function initAudio() {
    if (!state.audioContext) {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) {
            return null;
        }

        state.audioContext = new AudioContextCtor();
    }

    if (state.audioContext.state === 'suspended') {
        try {
            await state.audioContext.resume();
        } catch {
            // If resume fails we still allow click-based counting.
        }
    }

    return state.audioContext;
}

function playTick() {
    if (!state.audioContext) {
        return;
    }

    const now = state.audioContext.currentTime;
    const oscillator = state.audioContext.createOscillator();
    const gainNode = state.audioContext.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(1200, now);
    oscillator.frequency.exponentialRampToValueAtTime(860, now + 0.035);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.12, now + 0.008);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    oscillator.connect(gainNode);
    gainNode.connect(state.audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.065);
}

function playSuccessChime() {
    if (!state.audioContext) {
        return;
    }

    const now = state.audioContext.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((frequency, index) => {
        const offset = index * 0.08;
        const oscillator = state.audioContext.createOscillator();
        const gainNode = state.audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, now + offset);
        gainNode.gain.setValueAtTime(0.0001, now + offset);
        gainNode.gain.exponentialRampToValueAtTime(0.16, now + offset + 0.015);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.28);

        oscillator.connect(gainNode);
        gainNode.connect(state.audioContext.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.3);
    });
}

function pulseCounter() {
    counterEl.classList.remove('pulse');
    void counterEl.offsetWidth;
    counterEl.classList.add('pulse');
}

function angleDifference(current, baseline) {
    const delta = current - baseline;
    return ((delta + 180) % 360 + 360) % 360 - 180;
}

function getOrientationReading(event) {
    if (typeof event.gamma === 'number' && Number.isFinite(event.gamma)) {
        return { axis: 'gamma', value: event.gamma };
    }

    if (typeof event.beta === 'number' && Number.isFinite(event.beta)) {
        return { axis: 'beta', value: event.beta };
    }

    return null;
}

function incrementCounter() {
    if (!state.started) {
        return;
    }

    state.counter += 1;
    counterEl.textContent = String(state.counter);
    pulseCounter();
    playTick();

    if (state.counter < COUNTER_LIMIT) {
        return;
    }

    state.counter = 0;
    state.totalRounds += 1;
    writeStoredNumber(STORAGE_KEYS.totalRounds, state.totalRounds);
    counterEl.textContent = '0';
    roundsEl.textContent = String(state.totalRounds);
    playSuccessChime();
    setStatus('Round complete.');
}

function handleOrientation(event) {
    if (!state.started) {
        return;
    }

    const reading = getOrientationReading(event);
    if (!reading) {
        return;
    }

    if (!state.axis) {
        state.axis = reading.axis;
    }

    if (state.baseline === null) {
        state.baseline = reading.value;
        state.armed = false;
        setStatus(`Baseline saved on ${state.axis}. Twist away, then return.`);
        return;
    }

    const delta = Math.abs(angleDifference(reading.value, state.baseline));

    if (delta > ARM_THRESHOLD) {
        state.armed = true;
        return;
    }

    if (state.armed && delta <= RESET_THRESHOLD) {
        state.armed = false;
        incrementCounter();
    }
}

async function startSession() {
    if (state.started) {
        return;
    }

    state.started = true;
    startBtn.disabled = true;
    startBtn.textContent = 'Running';

    const audioReadyPromise = initAudio();

    window.addEventListener('deviceorientation', handleOrientation, { passive: true });

    let permissionPromise = Promise.resolve('granted');
    let permissionIsSupported = false;

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            permissionIsSupported = true;
            permissionPromise = DeviceOrientationEvent.requestPermission().catch(() => 'denied');
        } catch {
            permissionPromise = Promise.resolve('denied');
        }
    }

    const permission = await permissionPromise;
    await audioReadyPromise;

    if (permissionIsSupported) {
        if (permission === 'granted') {
            setStatus('Hold the phone steady for calibration.');
        } else {
            setStatus('Orientation permission denied. Tap anywhere to count.');
        }
        return;
    }

    setStatus('Hold the phone steady for calibration.');
}

startBtn.addEventListener('click', startSession);

document.addEventListener('click', (event) => {
    if (!state.started) {
        return;
    }

    if (event.target.closest('#startBtn')) {
        return;
    }

    incrementCounter();
});
