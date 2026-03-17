// script.js

// --- Models ---
class Ship {
    constructor(length) {
        this.length = length;
        this.hits = 0;
            }
    hit() {
        if (this.hits < this.length) this.hits++;
    }
    isSunk() {
        return this.hits >= this.length;
    }
}

class Gameboard {
    constructor(size = 10) {
        this.size = size;
        this.grid = Array.from({ length: size }, () => Array(size).fill(null));
        this.ships = [];
        this.missedAttacks = [];
    }

    hasClearance(length, row, col, isHorizontal) {
        if (isHorizontal) {
            if (col + length > this.size) return false;
        } else {
            if (row + length > this.size) return false;
        }

        const startRow = Math.max(0, row - 1);
        const endRow = Math.min(this.size - 1, isHorizontal ? row + 1 : row + length);
        const startCol = Math.max(0, col - 1);
        const endCol = Math.min(this.size - 1, isHorizontal ? col + length : col + 1);

        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                if (this.grid[r][c] !== null) {
                    return false;
                }
            }
        }

        return true;
    }

    placeShip(ship, row, col, isHorizontal) {
        // Validation
        if (isHorizontal) {
            if (col + ship.length > this.size) return false;
            for (let i = 0; i < ship.length; i++) {
                if (this.grid[row][col + i] !== null) return false;
            }
        } else {
            if (row + ship.length > this.size) return false;
            for (let i = 0; i < ship.length; i++) {
                if (this.grid[row + i][col] !== null) return false;
            }
        }

        // Placement
        if (isHorizontal) {
            for (let i = 0; i < ship.length; i++) {
                this.grid[row][col + i] = { ship, index: i };
            }
        } else {
            for (let i = 0; i < ship.length; i++) {
                this.grid[row + i][col] = { ship, index: i };
            }
        }
        
        this.ships.push(ship);
        return true;
    }

    receiveAttack(row, col) {
        if (row < 0 || row >= this.size || col < 0 || col >= this.size) return false;                                                                           
        const target = this.grid[row][col];
        if (target === null) {
            const alreadyMissed = this.missedAttacks.some(m => m.row === row && m.col === col);
            if (!alreadyMissed) {
                this.missedAttacks.push({ row, col });
            }
            this.grid[row][col] = 'miss';
            return true;
        } else if (target === 'miss' || (target && target.isHit)) {
            return false;
        } else if (target && target.ship) {
            target.ship.hit();
            target.isHit = true;
            return true;
        }
        return false;
    }

    allShipsSunk() {
        return this.ships.length > 0 && this.ships.every(ship => ship.isSunk());
    }
}

class Player {
    constructor(isComputer = false) {
        this.isComputer = isComputer;
        this.gameboard = new Gameboard();
    }
}

// --- State Management ---
const GameState = {
    PHASE: 'SETUP', // 'SETUP', 'PLAYING', 'GAMEOVER'
    CURRENT_TURN: 'PLAYER', // 'PLAYER', 'COMPUTER'
    player: null,
    computer: null,
    draggedShipLength: 0,
    isHorizontal: true
};

const AudioState = {
    enabled: false,
    locked: false,
    context: null,
    masterGain: null,
    musicGain: null,
    musicTimer: null,
    sequenceLength: 0,
    gameOverPlayed: false
};

function ensureAudioContext() {
    if (AudioState.context) return;
    const AudioContextRef = window.AudioContext || window.webkitAudioContext;
    AudioState.context = new AudioContextRef();
    AudioState.masterGain = AudioState.context.createGain();
    AudioState.masterGain.gain.value = 0.5;
    AudioState.masterGain.connect(AudioState.context.destination);

    AudioState.musicGain = AudioState.context.createGain();
    AudioState.musicGain.gain.value = 0.25;
    AudioState.musicGain.connect(AudioState.masterGain);
}

function playTone({ freq, duration = 0.14, type = 'sine', gain = 0.3, startTime = null, output = 'master' }) {
    if (!AudioState.enabled) return;
    ensureAudioContext();
    const ctx = AudioState.context;
    if (ctx.state === 'suspended') {
        ctx.resume().then(() => playTone({ freq, duration, type, gain, startTime, output }));
        return;
    }

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const targetGain = Math.max(0.0001, gain);
    const start = startTime ?? ctx.currentTime;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gainNode.gain.setValueAtTime(0.0001, start);
    gainNode.gain.exponentialRampToValueAtTime(targetGain, start + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gainNode);
    if (output === 'music') {
        gainNode.connect(AudioState.musicGain);
    } else {
        gainNode.connect(AudioState.masterGain);
    }

    osc.start(start);
    osc.stop(start + duration + 0.05);
}

function playSfx(type) {
    ensureAudioContext();
    const now = AudioState.context.currentTime;

    switch (type) {
        case 'place':
            playTone({ freq: 520, duration: 0.09, type: 'triangle', gain: 0.2 });
            playTone({ freq: 720, duration: 0.12, type: 'triangle', gain: 0.16, startTime: now + 0.05 });
            break;
        case 'rotate':
            playTone({ freq: 420, duration: 0.08, type: 'sine', gain: 0.18 });
            break;
        case 'hit':
            playTone({ freq: 190, duration: 0.14, type: 'square', gain: 0.32 });
            playTone({ freq: 120, duration: 0.18, type: 'square', gain: 0.2, startTime: now + 0.05 });
            break;
        case 'enemy-hit':
            playTone({ freq: 150, duration: 0.12, type: 'square', gain: 0.26 });
            playTone({ freq: 100, duration: 0.16, type: 'square', gain: 0.18, startTime: now + 0.05 });
            break;
        case 'miss':
            playTone({ freq: 540, duration: 0.1, type: 'sine', gain: 0.16 });
            break;
        case 'enemy-miss':
            playTone({ freq: 470, duration: 0.1, type: 'sine', gain: 0.12 });
            break;
        case 'invalid':
            playTone({ freq: 220, duration: 0.12, type: 'sawtooth', gain: 0.2 });
            break;
        case 'gameover':
            playTone({ freq: 160, duration: 0.4, type: 'triangle', gain: 0.25 });
            playTone({ freq: 120, duration: 0.5, type: 'triangle', gain: 0.2, startTime: now + 0.08 });
            break;
        default:
            break;
    }
}

function scheduleMusicSequence() {
    ensureAudioContext();
    const ctx = AudioState.context;
    const pattern = [
        { freq: 220, dur: 0.35 },
        { freq: 262, dur: 0.35 },
        { freq: 294, dur: 0.35 },
        { freq: 330, dur: 0.35 },
        { freq: 294, dur: 0.35 },
        { freq: 262, dur: 0.35 },
        { freq: 247, dur: 0.45 }
    ];

    let time = ctx.currentTime + 0.05;
    pattern.forEach(note => {
        playTone({
            freq: note.freq,
            duration: note.dur,
            type: 'sine',
            gain: 0.1,
            startTime: time,
            output: 'music'
        });
        time += note.dur;
    });

    AudioState.sequenceLength = pattern.reduce((sum, note) => sum + note.dur, 0);
}

function startMusic() {
    if (!AudioState.enabled || AudioState.musicTimer) return;
    ensureAudioContext();
    scheduleMusicSequence();
    AudioState.musicTimer = setInterval(() => {
        scheduleMusicSequence();
    }, Math.max(1000, AudioState.sequenceLength * 1000));
}

function stopMusic() {
    if (AudioState.musicTimer) {
        clearInterval(AudioState.musicTimer);
        AudioState.musicTimer = null;
    }
}

function setAudioButtonState() {
    const button = document.getElementById('audio-toggle-btn');
    if (!button) return;
    button.textContent = AudioState.enabled ? 'Audio: On' : 'Audio: Off';
    button.setAttribute('aria-pressed', AudioState.enabled.toString());
    button.classList.toggle('is-on', AudioState.enabled);
    button.disabled = !!AudioState.locked;
}

function toggleAudio() {
    if (AudioState.locked) return;
    AudioState.enabled = !AudioState.enabled;
    if (AudioState.enabled) {
        ensureAudioContext();
        const resumePromise = AudioState.context.state === 'suspended'
            ? AudioState.context.resume()
            : Promise.resolve();
        resumePromise.then(() => startMusic());
    } else {
        stopMusic();
    }
    setAudioButtonState();
}

function unlockAudio() {
    if (!AudioState.enabled) return;
    ensureAudioContext();
    const resumePromise = AudioState.context.state === 'suspended'
        ? AudioState.context.resume()
        : Promise.resolve();
    resumePromise.then(() => startMusic());
}

function initGame() {
    GameState.player = new Player(false);
    GameState.computer = new Player(true);
    GameState.PHASE = 'SETUP';
    GameState.CURRENT_TURN = 'PLAYER';
    AudioState.gameOverPlayed = false;
    
    // Auto-place ships for computer
    autoPlaceShips(GameState.computer.gameboard);
}

function autoPlaceShips(gameboard) {
    const shipLengths = [5, 4, 3, 3, 2];

    for (const length of shipLengths) {
        let placed = false;
        while (!placed) {
            const row = Math.floor(Math.random() * gameboard.size);
            const col = Math.floor(Math.random() * gameboard.size);
            const isHorizontal = Math.random() < 0.5;
            
            if (gameboard.hasClearance(length, row, col, isHorizontal)) {
                const ship = new Ship(length);
                placed = gameboard.placeShip(ship, row, col, isHorizontal);
            }
        }
    }
}

function renderBoard(boardId, gameboard, isComputerBoard) {
    const boardElement = document.getElementById(boardId);
    boardElement.innerHTML = '';

    for (let row = 0; row < gameboard.size; row++) {
        for (let col = 0; col < gameboard.size; col++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = row;
            cell.dataset.col = col;

            const cellData = gameboard.grid[row][col];
            if (cellData === 'miss') {
                cell.classList.add('miss');
            } else if (cellData && cellData.ship) {
                if (cellData.isHit) {
                    cell.classList.add('hit');
                    if (cellData.ship.isSunk()) {
                        cell.classList.add('sunk');
                    }
                } else if (!isComputerBoard) {
                    cell.classList.add('ship');
                } else if (isComputerBoard && GameState.PHASE === 'GAMEOVER') {
                    // Show computer ships when game is over
                    cell.classList.add('ship');
                }
            }

            if (isComputerBoard) {
                cell.addEventListener('click', () => handlePlayerAttack(row, col));
            } else if (GameState.PHASE === 'SETUP') {
                cell.addEventListener('click', () => handleShipPlacement(row, col));
                cell.addEventListener('mouseover', () => handlePlacementHover(row, col));
                cell.addEventListener('mouseout', () => handlePlacementMouseout(row, col));
            }

            boardElement.appendChild(cell);
        }
    }
}

function updateUI() {
    renderBoard('player-board', GameState.player.gameboard, false);
    renderBoard('computer-board', GameState.computer.gameboard, true);

    document.getElementById('player-ships-count').textContent = GameState.player.gameboard.ships.filter(s => !s.isSunk()).length;                                   
    document.getElementById('computer-ships-count').textContent = GameState.computer.gameboard.ships.filter(s => !s.isSunk()).length;                           
    
    const rotateBtn = document.getElementById('rotate-btn');
    const restartBtn = document.getElementById('restart-btn');
    
    if (GameState.PHASE === 'GAMEOVER') {
        rotateBtn.classList.add('hidden');
        restartBtn.classList.remove('hidden');
        
        const message = GameState.player.gameboard.allShipsSunk() ? 'Computer Wins!' : 'Player Wins!';                                                                  
        document.getElementById('game-message').textContent = message;
        showGameOver(message);
    } else if (GameState.PHASE === 'PLAYING') {
        rotateBtn.classList.add('hidden');
        restartBtn.classList.remove('hidden');
        document.getElementById('game-message').textContent = GameState.CURRENT_TURN === 'PLAYER' ? 'Your Turn to Attack' : 'Computer is Attacking...';             
    } else {
        rotateBtn.classList.remove('hidden');
        restartBtn.classList.add('hidden');
        if (shipsToPlace.length > 0) {
            document.getElementById('game-message').textContent = `Place your ships (Length: ${shipsToPlace[0]})`;                                                      
        }
    }
}

function showGameOver(message) {
    const overlay = document.getElementById('game-over-overlay');
    const title = document.getElementById('game-over-title');
    const text = document.getElementById('game-over-text');
    
    title.textContent = 'Game Over!';
    text.textContent = message;
    overlay.classList.remove('hidden');

    if (!AudioState.gameOverPlayed) {
        playSfx('gameover');
        AudioState.gameOverPlayed = true;
    }
    
    document.getElementById('computer-board').classList.add('disabled');
    document.getElementById('player-board').classList.add('disabled');
}

function resetGame() {
    document.getElementById('game-over-overlay').classList.add('hidden');
    document.getElementById('computer-board').classList.add('disabled');
    document.getElementById('player-board').classList.remove('disabled');
    
    shipsToPlace = [5, 4, 3, 3, 2];
    initGame();
    updateUI();
    AudioState.gameOverPlayed = false;
}

let shipsToPlace = [5, 4, 3, 3, 2];

function handleSetupPhaseUI() {
    const rotateBtn = document.getElementById('rotate-btn');
    rotateBtn.addEventListener('click', () => {
        GameState.isHorizontal = !GameState.isHorizontal;
        rotateBtn.textContent = GameState.isHorizontal ? 'Rotate Axis (Y)' : 'Rotate Axis (X)';                                                                     
        playSfx('rotate');
    });

    const audioToggleBtn = document.getElementById('audio-toggle-btn');
    if (audioToggleBtn) {
        audioToggleBtn.addEventListener('click', () => {
            toggleAudio();
        });
        setAudioButtonState();
    }

    const restartBtn = document.getElementById('restart-btn');
    restartBtn.addEventListener('click', resetGame);
    
    const modalRestartBtn = document.getElementById('modal-restart-btn');
    modalRestartBtn.addEventListener('click', resetGame);
}

function handleShipPlacement(row, col) {
    if (GameState.PHASE !== 'SETUP' || shipsToPlace.length === 0) return;
    
    const length = shipsToPlace[0];
    if (!GameState.player.gameboard.hasClearance(length, row, col, GameState.isHorizontal)) {
        playSfx('invalid');
        return;
    }
    const ship = new Ship(length);
    const placed = GameState.player.gameboard.placeShip(ship, row, col, GameState.isHorizontal);
    
    if (placed) {
        playSfx('place');
        shipsToPlace.shift();
        if (shipsToPlace.length === 0) {
            GameState.PHASE = 'PLAYING';
            document.getElementById('computer-board').classList.remove('disabled');
        }
        updateUI();
    }
}

function handlePlacementHover(row, col) {
    if (GameState.PHASE !== 'SETUP' || shipsToPlace.length === 0) return;       
    const length = shipsToPlace[0];

    const allCells = document.querySelectorAll('#player-board .cell');     
    allCells.forEach(cell => cell.classList.remove('placement-hover', 'placement-invalid'));                                                                            
    let valid = GameState.player.gameboard.hasClearance(length, row, col, GameState.isHorizontal);
    const cellsToHighlight = [];

    for (let i = 0; i < length; i++) {
        const r = GameState.isHorizontal ? row : row + i;
        const c = GameState.isHorizontal ? col + i : col;

        const cell = document.querySelector(`#player-board .cell[data-row="${r}"][data-col="${c}"]`);                                                              
        if (cell) cellsToHighlight.push(cell);
    }

    cellsToHighlight.forEach(cell => {
        cell.classList.add(valid ? 'placement-hover' : 'placement-invalid');
    });
}

function handlePlacementMouseout(row, col) {
    const allCells = document.querySelectorAll('#player-board .cell');     
    allCells.forEach(cell => cell.classList.remove('placement-hover', 'placement-invalid'));
}

function handlePlayerAttack(row, col) {
    if (GameState.PHASE !== 'PLAYING' || GameState.CURRENT_TURN !== 'PLAYER') return;
    const target = GameState.computer.gameboard.grid[row][col];
    const wasShip = target && target.ship;
    const result = GameState.computer.gameboard.receiveAttack(row, col);
    if (!result) return; // Invalid move (e.g., already attacked)

    playSfx(wasShip ? 'hit' : 'miss');
    
    updateUI();
    
    if (GameState.computer.gameboard.allShipsSunk()) {
        GameState.PHASE = 'GAMEOVER';
        updateUI();
        return;
    }
    if (!wasShip) {
        GameState.CURRENT_TURN = 'COMPUTER';
        updateUI();
        setTimeout(computerTurn, 1000);
    }
}

function computerTurn() {
    if (GameState.PHASE !== 'PLAYING') return;
    let attackValid = false;
    let row, col;
    let willHit = false;

    while (!attackValid) {
        row = Math.floor(Math.random() * GameState.player.gameboard.size);      
        col = Math.floor(Math.random() * GameState.player.gameboard.size);      
        const cellData = GameState.player.gameboard.grid[row][col];
        if (cellData !== 'miss' && !(cellData && cellData.isHit)) {
            attackValid = true;
            willHit = !!(cellData && cellData.ship);
        }
    }

    GameState.player.gameboard.receiveAttack(row, col);
    playSfx(willHit ? 'enemy-hit' : 'enemy-miss');
    updateUI();

    if (GameState.player.gameboard.allShipsSunk()) {
        GameState.PHASE = 'GAMEOVER';
        updateUI();
        return;
    }

    if (!willHit) {
        GameState.CURRENT_TURN = 'PLAYER';
        updateUI();
    } else {
        setTimeout(computerTurn, 1000);
    }
}

function setupParallaxBackground() {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (prefersReduced.matches) return;

    const root = document.documentElement;
    const maxOffset = 22;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const handleMove = (event) => {
        const x = event.clientX / window.innerWidth - 0.5;
        const y = event.clientY / window.innerHeight - 0.5;
        targetX = x * 2 * maxOffset;
        targetY = y * 2 * maxOffset;
    };

    const handleLeave = () => {
        targetX = 0;
        targetY = 0;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseleave', handleLeave);

    const tick = () => {
        currentX += (targetX - currentX) * 0.08;
        currentY += (targetY - currentY) * 0.08;
        root.style.setProperty('--parallax-x', currentX.toFixed(2));
        root.style.setProperty('--parallax-y', currentY.toFixed(2));
        requestAnimationFrame(tick);
    };

    tick();
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Battleship game loaded.');
    initGame();
    handleSetupPhaseUI();
    updateUI();
    setupParallaxBackground();
    document.addEventListener('pointerdown', unlockAudio, { once: true });
});
