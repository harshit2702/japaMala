// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}

// State
let counter = 0;
let rounds = 0;
let audioContext = null;
let isStarted = false;
let baselineGamma = null;
let isTwisting = false;

// DOM Elements
const counterEl = document.getElementById('counter');
const roundsEl = document.getElementById('rounds');
const startBtn = document.getElementById('startBtn');
const statusEl = document.getElementById('status');

// Load saved rounds
const savedRounds = localStorage.getItem('japaRounds');
if (savedRounds) {
    rounds = parseInt(savedRounds, 10);
    roundsEl.textContent = rounds;
}

// Audio Context initialization
function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// Play tick sound
function playTick() {
    if (!audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

// Play success chime
function playSuccessChime() {
    if (!audioContext) return;
    
    const now = audioContext.currentTime;
    
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = freq;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, now + i * 0.05);
        gainNode.gain.linearRampToValueAtTime(0.2, now + i * 0.05 + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + i * 0.05 + 0.5);
        
        oscillator.start(now + i * 0.05);
        oscillator.stop(now + i * 0.05 + 0.5);
    });
}

// Pulse animation
function pulseCounter() {
    counterEl.classList.remove('pulse');
    void counterEl.offsetWidth; // Trigger reflow
    counterEl.classList.add('pulse');
    setTimeout(() => counterEl.classList.remove('pulse'), 100);
}

// Increment counter
function incrementCounter() {
    if (!isStarted) return;
    
    counter++;
    counterEl.textContent = counter;
    pulseCounter();
    playTick();
    
    if (counter >= 108) {
        counter = 0;
        counterEl.textContent = '0';
        rounds++;
        roundsEl.textContent = rounds;
        localStorage.setItem('japaRounds', rounds.toString());
        playSuccessChime();
        counterEl.classList.add('success-chime');
        setTimeout(() => counterEl.classList.remove('success-chime'), 500);
    }
}

// Device Orientation handling
function handleOrientation(event) {
    if (!isStarted || baselineGamma === null) return;
    
    const gamma = event.gamma;
    if (gamma === null) return;
    
    // Check if twisting (gamma outside 40 degrees from baseline)
    if (Math.abs(gamma - baselineGamma) > 40) {
        isTwisting = true;
    }
    
    // Check if returning to baseline (within 10 degrees)
    if (isTwisting && Math.abs(gamma - baselineGamma) <= 10) {
        incrementCounter();
        isTwisting = false;
    }
}

// Start button handler
startBtn.addEventListener('click', async () => {
    if (isStarted) return;
    
    initAudio();
    
    // Request permissions for iOS 13+
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation);
                statusEl.textContent = 'Orientation tracking enabled';
            } else {
                statusEl.textContent = 'Orientation permission denied';
            }
        } catch (error) {
            statusEl.textContent = 'Error requesting permission: ' + error.message;
        }
    } else {
        // Non-iOS 13+ devices
        window.addEventListener('deviceorientation', handleOrientation);
        statusEl.textContent = 'Orientation tracking enabled';
    }
    
    // Set baseline
    baselineGamma = null;
    setTimeout(() => {
        if (window.orientationEventValue !== undefined) {
            baselineGamma = window.orientationEventValue;
            statusEl.textContent = `Calibrated (baseline: ${baselineGamma.toFixed(1)}°)`;
        }
    }, 500);
    
    isStarted = true;
    startBtn.disabled = true;
    startBtn.textContent = 'Started';
});

// Touch/click on body to increment
document.body.addEventListener('click', (e) => {
    if (e.target === document.body && isStarted) {
        incrementCounter();
    }
});

// Track initial gamma for baseline
window.addEventListener('deviceorientation', (event) => {
    if (!isStarted && event.gamma !== null) {
        window.orientationEventValue = event.gamma;
    }
});
