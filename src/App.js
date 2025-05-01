import React, { useState, useEffect, useCallback, useRef } from 'react';
import chroma from 'chroma-js';
import logoSrc from './logo.png'; // Make sure you have a logo.png file in the src folder
import './App.css'; // Make sure you have the updated App.css file

// --- Constants ---
const LOCAL_STORAGE_KEYS = {
    DARK_MODE: 'appDarkMode_v3',
    SAVED_PALETTES: 'appSavedPalettes_v3',
    DISPLAY_FORMAT: 'appDisplayFormat_v1',
};
const MAX_SAVED_PALETTES = 20;
const GRADIENT_DIRECTIONS = [ 'to right', 'to bottom', 'to top left', 'to bottom right', '45deg', '135deg' ];
const PALETTE_TYPES = [
    { value: 'monochromatic', label: 'Monochromatic' },
    { value: 'analogous', label: 'Analogous' },
    { value: 'complementary', label: 'Complementary' },
    { value: 'split-complementary', label: 'Split Complementary' },
    { value: 'triadic', label: 'Triadic' },
];
const DISPLAY_FORMATS = [
    { value: 'hex', label: 'HEX' },
    { value: 'rgb', label: 'RGB' },
    { value: 'hsl', label: 'HSL' }
];

// --- Helper Functions ---

// Generate Palette (Improved error handling)
const generatePalette = (baseColor, type = 'monochromatic', count = 5) => {
     if (!baseColor || !chroma.valid(baseColor) || count < 1) return [];
    try {
        const base = chroma(baseColor);
        let colors = [];
        const baseHex = base.hex(); // Use hex for consistency in scales

        if (base.luminance() === 0) { // Black
            colors = chroma.scale(['#000000', base.brighten(2).hex(), '#888888']).mode('lch').colors(count);
        } else if (base.luminance() === 1) { // White
            colors = chroma.scale(['#888888', base.darken(2).hex(), '#ffffff']).mode('lch').colors(count).reverse();
        } else {
            switch (type) {
                case 'analogous':
                    colors = chroma.scale([base.set('hsl.h', '+30'), base, base.set('hsl.h', '-30')]).mode('lch').colors(count);
                    break;
                case 'complementary':
                    const complementHue = (base.hsl()[0] + 180) % 360;
                    const complement = base.set('hsl.h', complementHue);
                    colors = (count <= 2)
                        ? [baseHex, complement.hex()].slice(0, count)
                        : chroma.scale([baseHex, complement.hex()]).mode('lch').colors(count);
                    break;
                case 'triadic':
                    const t1 = base.set('hsl.h', '+120');
                    const t2 = base.set('hsl.h', '-120');
                    colors = chroma.scale([base, t1, t2, base]).mode('lch').colors(count);
                    break;
                case 'split-complementary':
                    const sc1 = base.set('hsl.h', '+150');
                    const sc2 = base.set('hsl.h', '-150');
                    colors = chroma.scale([base, sc1, sc2, base]).mode('lch').colors(count);
                    break;
                case 'monochromatic':
                default:
                    colors = chroma.scale([base.darken(2), base, base.brighten(2)]).mode('lch').colors(count);
                    break;
            }
        }
        return colors.map(c => {
            try { return chroma.valid(c) ? chroma(c).hex() : '#FF0000'; }
            catch { return '#FF0000'; }
        });
    } catch (error) {
        console.error(`Error generating ${type} palette for ${baseColor}:`, error);
        return [];
    }
};

// Format color values (with error check)
const safeColorFormat = (color, format) => {
     if (!color || !chroma.valid(color)) return 'N/A';
    try {
        const c = chroma(color);
        if (format === 'rgb') return `rgb(${c.rgb().map(Math.round).join(', ')})`;
        if (format === 'hsl') {
            const hsl = c.hsl();
            const h = isNaN(hsl[0]) ? 0 : Math.round(hsl[0]);
            const s = Math.round((isNaN(hsl[1]) ? 0 : hsl[1]) * 100);
            const l = Math.round((isNaN(hsl[2]) ? 0 : hsl[2]) * 100);
            return `hsl(${h}, ${s}%, ${l}%)`;
        }
        if (format === 'name') {
            try { return c.name(); }
            catch { return '~' + c.hex(); }
        }
        return c.hex();
    } catch {
        return 'Error';
    }
};

// Get random color
const getRandomHexColor = () => {
     try { return chroma.random().hex(); }
     catch { return '#808080'; }
};

// Download helper
const downloadJson = (data, filename = 'palette.json') => {
     const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
     const link = document.createElement("a");
     link.href = jsonString;
     link.download = filename;
     link.click();
     link.remove();
};

// ID generator for mix colors
let nextMixColorId = Date.now();
const createMixColorItem = (color) => {
     nextMixColorId++;
     const initialColor = color || getRandomHexColor();
     return {
        id: nextMixColorId,
        color: initialColor,
        valid: chroma.valid(initialColor),
        locked: false,
    };
};


// Load state from Local Storage (with robust parsing and default structure)
const loadStateFromLocalStorage = (key, defaultValue) => {
     try {
        const saved = localStorage.getItem(key);
        if (saved === null) return defaultValue;

        const parsed = JSON.parse(saved);

        if (key === LOCAL_STORAGE_KEYS.SAVED_PALETTES && Array.isArray(parsed)) {
             return parsed.map(p => ({
                id: p.id || Date.now() + Math.random(),
                name: p.name || `Saved Palette ${p.id || ''}`,
                mixColors: Array.isArray(p.mixColors) ? p.mixColors.map(mc => {
                    if (typeof mc === 'string') {
                        return createMixColorItem(mc); // Use helper to ensure structure
                    }
                    return {
                        id: mc.id || Date.now() + Math.random(),
                        color: mc.color || '#ffffff',
                        valid: mc.valid !== undefined ? mc.valid : chroma.valid(mc.color || '#ffffff'),
                        locked: mc.locked !== undefined ? mc.locked : false,
                    };
                }) : [createMixColorItem('#ffffff')],
                mixedColor: p.mixedColor || '#808080',
                palette: Array.isArray(p.palette) ? p.palette : [],
                type: p.type || 'monochromatic',
                count: p.count || 5,
                gradientDirection: p.gradientDirection || 'to right',
            })).slice(0, MAX_SAVED_PALETTES);
        }

        if (key === LOCAL_STORAGE_KEYS.DARK_MODE) {
            return typeof parsed === 'boolean' ? parsed : defaultValue;
        }
        if (key === LOCAL_STORAGE_KEYS.DISPLAY_FORMAT) {
             return typeof parsed === 'string' && ['hex', 'rgb', 'hsl'].includes(parsed) ? parsed : defaultValue;
        }

        return parsed;
    } catch (error) {
        console.error(`LS Error (Loading ${key}):`, error);
        return defaultValue;
    }
};

// --- Image Picker Modal Component ---
const ImagePickerModal = ({ isOpen, imageSrc, onClose, onColorSelect }) => {
    const canvasRef = useRef(null);
    const [hoverColor, setHoverColor] = useState(null); // Color under the cursor
    const [selectedColor, setSelectedColor] = useState(null); // Color selected by clicking

    // Draw image onto canvas when modal opens or image changes
    useEffect(() => {
        if (isOpen && imageSrc && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d', { willReadFrequently: true }); // willReadFrequently for performance
            const img = new Image();
            img.onload = () => {
                // Resize canvas to fit image while maintaining aspect ratio (max width/height)
                const maxWidth = window.innerWidth * 0.8; // Max 80% viewport width
                const maxHeight = window.innerHeight * 0.7; // Max 70% viewport height
                let { width, height } = img;

                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                setSelectedColor(null); // Reset selected color when new image loads
                setHoverColor(null); // Reset hover color
            };
            img.onerror = () => {
                 console.error("Error loading image for canvas.");
                 onClose(); // Close modal if image fails to load
            };
            img.src = imageSrc;
        }
    }, [isOpen, imageSrc, onClose]);

    // Get color from canvas coordinates
    const getColorFromCanvas = (event) => {
        if (!canvasRef.current) return null;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Ensure coordinates are within canvas bounds
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
            return null;
        }

        const pixelData = ctx.getImageData(x, y, 1, 1).data;
        // Convert RGBA to HEX (ignoring alpha for simplicity here)
        try {
            const color = chroma([pixelData[0], pixelData[1], pixelData[2]]).hex();
            return color;
        } catch {
            return null; // Return null if chroma fails
        }
    };

    // Handle mouse move over canvas
    const handleMouseMove = (event) => {
        const color = getColorFromCanvas(event);
        setHoverColor(color);
    };

    // Handle click on canvas
    const handleCanvasClick = (event) => {
        const color = getColorFromCanvas(event);
        if (color) {
            setSelectedColor(color); // Set the selected color for preview
        }
    };

    // Handle selecting the final color
    const handleSelectClick = () => {
        if (selectedColor) {
            onColorSelect(selectedColor); // Pass selected color back
            onClose(); // Close modal
        }
    };

    // Handle leaving the canvas area
    const handleMouseLeave = () => {
        setHoverColor(null); // Clear hover color when mouse leaves
    };

    if (!isOpen) return null;

    // Basic modal styling (inline for simplicity, could be moved to CSS)
    const modalStyle = {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 1200,
        padding: '20px'
    };
    const contentStyle = {
        backgroundColor: 'var(--background-card)', color: 'var(--text-dark)',
        padding: '20px 30px', borderRadius: 'var(--border-radius-lg)',
        boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: '15px', maxWidth: '90vw', maxHeight: '90vh'
    };
    const canvasContainerStyle = {
        maxWidth: 'calc(90vw - 60px)', // Account for padding
        maxHeight: 'calc(90vh - 150px)', // Account for padding and controls height
        overflow: 'auto', // Add scroll if canvas is larger than container
        border: '1px solid var(--border-color)',
        cursor: 'crosshair' // Indicate picking mode
    };
     const previewStyle = {
        display: 'flex', alignItems: 'center', gap: '10px',
        minHeight: '40px', // Ensure space even if no color
        border: '1px solid var(--border-light)', padding: '5px 10px',
        borderRadius: 'var(--border-radius-md)', width: '100%',
        backgroundColor: 'var(--background-section)'
    };
    const swatchStyle = (color) => ({
        width: '25px', height: '25px', borderRadius: 'var(--border-radius-sm)',
        backgroundColor: color || 'transparent',
        border: '1px solid var(--border-color)',
        flexShrink: 0
    });

    return (
        <div style={modalStyle} onClick={onClose}> {/* Close on backdrop click */}
            <div style={contentStyle} onClick={(e) => e.stopPropagation()}> {/* Prevent closing when clicking content */}
                <h3>Pick a Color from Image</h3>
                <div style={canvasContainerStyle}>
                    <canvas
                        ref={canvasRef}
                        onMouseMove={handleMouseMove}
                        onClick={handleCanvasClick}
                        onMouseLeave={handleMouseLeave}
                        title="Move mouse to see color, click to select"
                    />
                </div>
                 <div style={previewStyle}>
                    <span>Hover:</span>
                    <div style={swatchStyle(hoverColor)}></div>
                    <span>{hoverColor || 'N/A'}</span>
                    <span style={{ marginLeft: 'auto' }}>Selected:</span>
                    <div style={swatchStyle(selectedColor)}></div>
                    <span>{selectedColor || 'N/A'}</span>
                </div>
                <div>
                    <button
                        onClick={handleSelectClick}
                        className="button save-palette-button" // Reuse existing style
                        disabled={!selectedColor} // Disable if no color is clicked
                        style={{ marginRight: '10px' }}
                    >
                        Select Color
                    </button>
                    <button onClick={onClose} className="button delete-button"> {/* Reuse style */}
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- Main Application Component ---
function App() {
    // --- State Variables ---
    const [mixColors, setMixColors] = useState(() => [
        createMixColorItem('#e11d48'),
        createMixColorItem('#2563eb'),
    ]);
    const [mixedColor, setMixedColor] = useState(null);
    const [paletteType, setPaletteType] = useState('monochromatic');
    const [colorCount, setColorCount] = useState(5);
    const [palette, setPalette] = useState([]);
    const [copiedValue, setCopiedValue] = useState(null);
    const [isDarkMode, setIsDarkMode] = useState(() =>
        loadStateFromLocalStorage(LOCAL_STORAGE_KEYS.DARK_MODE, window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
    const [showDetails, setShowDetails] = useState(false);
    const [displayFormat, setDisplayFormat] = useState(() =>
        loadStateFromLocalStorage(LOCAL_STORAGE_KEYS.DISPLAY_FORMAT, 'hex')
    );
    const [savedPalettes, setSavedPalettes] = useState(() =>
        loadStateFromLocalStorage(LOCAL_STORAGE_KEYS.SAVED_PALETTES, [])
    );
    const [feedbackMessage, setFeedbackMessage] = useState('');
    const [gradientDirection, setGradientDirection] = useState('to right');
    const [editingPaletteId, setEditingPaletteId] = useState(null);
    const [editedPaletteName, setEditedPaletteName] = useState('');
    const fileInputRef = useRef(null); // For JSON import
    const imageInputRef = useRef(null); // For Image upload
    const [isEyeDropperSupported, setIsEyeDropperSupported] = useState(false);
    const [showImagePicker, setShowImagePicker] = useState(false); // Modal visibility
    const [uploadedImageSrc, setUploadedImageSrc] = useState(null); // Data URL of uploaded image

    // --- Effects ---

    // Check for EyeDropper support on mount
    useEffect(() => {
        if ('EyeDropper' in window) {
            setIsEyeDropperSupported(true);
        }
    }, []);

    // Calculate mixed color
    useEffect(() => {
        const validColorsToMix = mixColors.filter(item => item.valid).map(item => item.color);
        if (validColorsToMix.length >= 2) {
            try { setMixedColor(chroma.average(validColorsToMix, 'lab').hex()); }
            catch (e) { console.error("Mixing error:", e); setMixedColor(null); }
        } else if (validColorsToMix.length === 1) {
            try { setMixedColor(chroma(validColorsToMix[0]).hex()); }
            catch { setMixedColor(null); }
        } else {
            setMixedColor(null);
        }
    }, [mixColors]);

    // Regenerate palette
    useEffect(() => {
        setPalette(mixedColor && chroma.valid(mixedColor)
            ? generatePalette(mixedColor, paletteType, colorCount)
            : []
        );
    }, [mixedColor, paletteType, colorCount]);

    // Toggle dark mode class & save preference
    useEffect(() => {
        document.body.classList.toggle('dark-mode', isDarkMode);
        document.body.classList.toggle('light-mode', !isDarkMode);
        try { localStorage.setItem(LOCAL_STORAGE_KEYS.DARK_MODE, JSON.stringify(isDarkMode)); }
        catch (e) { console.error("LS Error (Dark Mode):", e); }
    }, [isDarkMode]);

    // Save palettes to LS
     useEffect(() => {
        try { localStorage.setItem(LOCAL_STORAGE_KEYS.SAVED_PALETTES, JSON.stringify(savedPalettes)); }
        catch (e) { console.error("LS Error (Saving Palettes):", e); setFeedbackMessage("Error saving palettes: Storage full?"); }
     }, [savedPalettes]);

    // Save display format preference
    useEffect(() => {
        try { localStorage.setItem(LOCAL_STORAGE_KEYS.DISPLAY_FORMAT, displayFormat); }
        catch (e) { console.error("LS Error (Display Format):", e); }
    }, [displayFormat]);

    // Clear feedback message
    useEffect(() => {
        let timer;
        if (feedbackMessage) { timer = setTimeout(() => setFeedbackMessage(''), 3000); }
        return () => clearTimeout(timer);
    }, [feedbackMessage]);

    // --- Event Handlers ---

    const handleMixColorChange = useCallback((id, value) => {
        setMixColors(prev => prev.map(item =>
            item.id === id ? { ...item, color: value, valid: chroma.valid(value) } : item
        ));
    }, []);

    // Modified addMixColor to optionally accept a color
    const addMixColor = useCallback((colorToAdd = null) => {
        const newColor = colorToAdd && chroma.valid(colorToAdd) ? colorToAdd : getRandomHexColor();
        setMixColors(prev => [...prev, createMixColorItem(newColor)]);
        setFeedbackMessage(`Color added: ${newColor}`);
    }, []);


    const removeMixColor = useCallback((id) => {
        if (mixColors.length <= 2) { setFeedbackMessage("Minimum of 2 mix colors required."); return; }
        setMixColors(prev => prev.filter(item => item.id !== id));
    }, [mixColors.length]);

    const toggleMixColorLock = useCallback((id) => {
        let wasLocked = false;
        setMixColors(prev => prev.map(item => {
            if (item.id === id) { wasLocked = item.locked; return { ...item, locked: !item.locked }; }
            return item;
        }));
        setFeedbackMessage(wasLocked ? "Color Unlocked" : "Color Locked");
    }, []);

    const randomizeMixColors = useCallback((id = null) => {
        let count = 0;
        setMixColors(prev => prev.map(item => {
            if (item.locked || (id !== null && item.id !== id)) { return item; }
            count++;
            const randColor = getRandomHexColor();
            return { ...item, color: randColor, valid: chroma.valid(randColor) };
        }));
        if (count > 0) { setFeedbackMessage(id === null ? `Randomized ${count} unlocked color(s)!` : `Color randomized!`); }
        else { setFeedbackMessage(id !== null ? `Color is locked.` : `All colors are locked.`); }
    }, []);

    const handleTypeChange = useCallback((e) => { setPaletteType(e.target.value); }, []);
    const handleCountChange = useCallback((e) => { setColorCount(parseInt(e.target.value, 10)); }, []);
    const handleGradientDirectionChange = useCallback((e) => { setGradientDirection(e.target.value); }, []);
    const handleDisplayFormatChange = useCallback((e) => { setDisplayFormat(e.target.value); }, []);

    const handleCopyValue = useCallback((value, type = 'hex') => {
        if (!value || value === 'N/A' || value === 'Error') { setFeedbackMessage('Cannot copy invalid or N/A value.'); return; }
        navigator.clipboard.writeText(value)
            .then(() => {
                setCopiedValue({ value, type });
                setFeedbackMessage(`${type.toUpperCase()} Copied!`);
                setTimeout(() => setCopiedValue(null), 1500);
            })
            .catch(err => { console.error('Clipboard Copy Error:', err); setFeedbackMessage('Copy failed.'); });
    }, []);

    const toggleDarkMode = useCallback(() => { setIsDarkMode(prev => !prev); }, []);
    const toggleDetailsDisplay = useCallback(() => { setShowDetails(prev => !prev); }, []);

    // --- EyeDropper API Handler ---
    const pickColorFromScreen = useCallback(async () => {
        if (!isEyeDropperSupported) {
            setFeedbackMessage("Your browser doesn't support the EyeDropper API.");
            return;
        }
        const eyeDropper = new window.EyeDropper();
        try {
            const result = await eyeDropper.open();
            addMixColor(result.sRGBHex); // Use addMixColor to add the picked color
        } catch (e) {
            setFeedbackMessage("Color selection cancelled.");
            console.log("EyeDropper cancelled", e);
        }
    }, [isEyeDropperSupported, addMixColor]);


    // --- Saved Palette Handlers ---
    const saveCurrentPalette = useCallback(() => {
        if (!mixedColor || palette.length === 0 || !chroma.valid(mixedColor)) { setFeedbackMessage("Cannot save an empty or invalid palette."); return; }
        if (savedPalettes.length >= MAX_SAVED_PALETTES) { setFeedbackMessage(`Max ${MAX_SAVED_PALETTES} palettes reached.`); return; }
        const now = new Date();
        const paletteName = `${paletteType} (${colorCount}) - ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        const newSavedPalette = { id: now.getTime(), name: paletteName, mixColors: mixColors.map(mc => ({...mc})), mixedColor, palette: [...palette], type: paletteType, count: colorCount, gradientDirection };
        const isDuplicate = savedPalettes.some(saved => JSON.stringify(saved.palette) === JSON.stringify(palette) && saved.type === paletteType && saved.count === colorCount && saved.gradientDirection === gradientDirection && JSON.stringify(saved.mixColors.map(m => m.color)) === JSON.stringify(mixColors.map(m => m.color)));
        if (isDuplicate) { setFeedbackMessage("This exact palette is already saved."); return; }
        setSavedPalettes(prev => [newSavedPalette, ...prev].slice(0, MAX_SAVED_PALETTES));
        setFeedbackMessage("Palette Saved!");
    }, [mixedColor, palette, paletteType, colorCount, gradientDirection, savedPalettes, mixColors]);

    const loadSavedPalette = useCallback((savedPalette) => {
        if (!savedPalette) return;
        setMixColors(savedPalette.mixColors.map(mc => ({ id: mc.id || Date.now() + Math.random(), color: mc.color || '#ffffff', valid: mc.valid !== undefined ? mc.valid : chroma.valid(mc.color || '#ffffff'), locked: mc.locked !== undefined ? mc.locked : false })));
        setPaletteType(savedPalette.type || 'monochromatic');
        setColorCount(savedPalette.count || 5);
        setGradientDirection(savedPalette.gradientDirection || 'to right');
        setFeedbackMessage(`Loaded: ${savedPalette.name}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    const deleteSavedPalette = useCallback((idToDelete) => {
        setSavedPalettes(prev => prev.filter(p => p.id !== idToDelete));
        setFeedbackMessage("Palette Deleted.");
    }, []);

    const exportPaletteJson = useCallback(() => {
         if (!mixedColor || palette.length === 0 || !chroma.valid(mixedColor)) { setFeedbackMessage("Cannot export an empty or invalid palette."); return; }
        const exportData = { name: `${paletteType}_${mixedColor.substring(1)}`, mixColors: mixColors.map(item => item.color), mixedColor, paletteType, colorCount, palette, gradientDirection, gradientCSS: `linear-gradient(${gradientDirection}, ${palette.join(', ')})` };
        downloadJson(exportData, `palette_${paletteType}_${mixedColor.substring(1)}.json`);
        setFeedbackMessage("Palette JSON exported!");
    }, [mixedColor, palette, paletteType, colorCount, mixColors, gradientDirection]);

    // --- Editable Saved Name Handlers ---
    const startEditingPaletteName = (paletteId, currentName) => { setEditingPaletteId(paletteId); setEditedPaletteName(currentName); };
    const handleEditNameChange = (event) => { setEditedPaletteName(event.target.value); };
    const saveEditedPaletteName = () => {
        if (!editingPaletteId) return;
        const trimmedName = editedPaletteName.trim();
        if (trimmedName) { setSavedPalettes(prev => prev.map(p => p.id === editingPaletteId ? { ...p, name: trimmedName } : p)); setFeedbackMessage("Palette name updated."); }
        else { setFeedbackMessage("Palette name cannot be empty."); }
        setEditingPaletteId(null); setEditedPaletteName('');
    };
    const cancelEditPaletteName = () => { setEditingPaletteId(null); setEditedPaletteName(''); };
    const handleEditNameKeyDown = (event) => {
        if (event.key === 'Enter') { saveEditedPaletteName(); }
        else if (event.key === 'Escape') { cancelEditPaletteName(); }
    };

    // --- Import JSON Palette Handler ---
    const handleFileImport = (event) => {
        const file = event.target.files[0];
        if (!file) { setFeedbackMessage("No file selected."); return; }
        if (file.type !== "application/json") { setFeedbackMessage("Invalid file type. Please select JSON."); if (fileInputRef.current) fileInputRef.current.value = ""; return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (importedData && Array.isArray(importedData.palette) && importedData.type && importedData.count && Array.isArray(importedData.mixColors)) {
                    const paletteToLoad = { id: Date.now(), name: importedData.name || `Imported ${new Date().toLocaleTimeString()}`, mixColors: importedData.mixColors.map(colorOrObj => typeof colorOrObj === 'string' ? createMixColorItem(colorOrObj) : createMixColorItem(colorOrObj.color)), mixedColor: importedData.mixedColor, palette: importedData.palette, type: importedData.type, count: importedData.count, gradientDirection: importedData.gradientDirection || 'to right', };
                    loadSavedPalette(paletteToLoad); setFeedbackMessage("Palette imported successfully!");
                } else { setFeedbackMessage("Import failed: Invalid JSON structure."); }
            } catch (error) { console.error("Import Error:", error); setFeedbackMessage("Import failed: Could not parse JSON."); }
            finally { if (fileInputRef.current) fileInputRef.current.value = ""; }
        };
        reader.onerror = () => { setFeedbackMessage("Import failed: Could not read file."); if (fileInputRef.current) fileInputRef.current.value = ""; };
        reader.readAsText(file);
    };
    const triggerFileInput = () => { fileInputRef.current?.click(); };

    // --- Image Upload Handlers ---
    const triggerImageInput = () => {
        imageInputRef.current?.click();
    };

    const handleImageUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Basic validation for image type
        if (!file.type.startsWith('image/')) {
            setFeedbackMessage("Invalid file type. Please upload an image.");
            if (imageInputRef.current) imageInputRef.current.value = ""; // Reset input
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            setUploadedImageSrc(e.target.result); // Set the image data URL
            setShowImagePicker(true); // Open the modal
            setFeedbackMessage("Image loaded. Pick a color.");
        };
        reader.onerror = () => {
            setFeedbackMessage("Error reading image file.");
        };
        reader.readAsDataURL(file);

        // Reset file input value so the same file can be uploaded again
        if (imageInputRef.current) imageInputRef.current.value = "";
    };

    // Callback when color is selected from the image picker modal
    const handleColorSelectedFromImage = (color) => {
        if (color && chroma.valid(color)) {
            addMixColor(color); // Add the selected color
        } else {
            setFeedbackMessage("Invalid color selected from image.");
        }
    };


    // --- Render Helper ---
    const renderPrimaryValue = (color, format) => {
        const value = safeColorFormat(color, format);
        const isValid = value !== 'N/A' && value !== 'Error';
        return (
            <div className="primary-value-display">
                 <span className={`color-code main-format-${format} ${!isValid ? 'invalid-value' : ''}`}>{value}</span>
                 <button onClick={() => handleCopyValue(value, format.toUpperCase())} className={`copy-detail-button ${copiedValue?.value === value ? 'copied-feedback' : ''}`} title={`Copy ${format.toUpperCase()}`} disabled={!isValid} aria-label={`Copy ${format.toUpperCase()} value ${value}`}>Copy</button>
            </div>
        );
    };
    const renderSecondaryDetails = (color) => {
        if (!showDetails || !chroma.valid(color)) return null;
        const name = safeColorFormat(color, 'name');
        const rgb = safeColorFormat(color, 'rgb');
        const hsl = safeColorFormat(color, 'hsl');
        const hex = safeColorFormat(color, 'hex');
        const copyButton = (value, format) => (<button onClick={() => handleCopyValue(value, format)} className={`copy-detail-button ${copiedValue?.value === value ? 'copied-feedback' : ''}`} title={`Copy ${format.toUpperCase()}`} aria-label={`Copy ${format.toUpperCase()} value ${value}`}>Copy</button>);
        return (
            <div className="color-details">
                {name && name !== 'N/A' && name !== 'Error' && !name.startsWith('~') && <span className="color-name">{name}</span>}
                {displayFormat !== 'rgb' && (<div className="detail-line"><span className="detail-value">{rgb}</span>{copyButton(rgb, 'rgb')}</div>)}
                {displayFormat !== 'hsl' && (<div className="detail-line"><span className="detail-value">{hsl}</span>{copyButton(hsl, 'hsl')}</div>)}
                {displayFormat !== 'hex' && (<div className="detail-line"><span className="detail-value">{hex}</span>{copyButton(hex, 'hex')}</div>)}
            </div>
        );
    };


    // --- Render Logic ---
    return (
        <div className="app-container">
            {/* Feedback Message Display */}
            {feedbackMessage && (<div className={`feedback-message ${feedbackMessage.toLowerCase().includes('error') || feedbackMessage.toLowerCase().includes('fail') ? 'error' : ''}`} role="status" aria-live="polite">{feedbackMessage}</div>)}

            {/* Dark Mode Toggle */}
            <button onClick={toggleDarkMode} className="dark-mode-toggle" aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"} title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}><span>{isDarkMode ? '☀️' : '🌙'}</span></button>

            {/* Image Picker Modal */}
            <ImagePickerModal
                isOpen={showImagePicker}
                imageSrc={uploadedImageSrc}
                onClose={() => setShowImagePicker(false)}
                onColorSelect={handleColorSelectedFromImage}
            />

            {/* Main Content Card */}
            <div className="card">
                <header className="app-header">
                    {logoSrc && <img src={logoSrc} className="app-logo" alt="" />}
                    <h1>Palette Pro</h1>
                </header>

                {/* Controls Section */}
                <section className="controls-section" aria-labelledby="controls-heading">
                    <h2 id="controls-heading" className="visually-hidden">Generator Controls</h2>
                    {/* Mix Base Colors Area */}
                    <div className="control-group mix-colors-area">
                        <label id="mix-label" className="control-label">1. Mix Base Colors</label>
                        <div className="mix-inputs-container" role="group" aria-labelledby="mix-label">
                            {mixColors.map((item, index) => (
                                <div key={item.id} className="mix-color-input-group">
                                    <button onClick={() => toggleMixColorLock(item.id)} className={`button icon-only lock-button ${item.locked ? 'locked' : ''}`} title={item.locked ? "Unlock Color" : "Lock Color"} aria-pressed={item.locked} aria-label={`Lock or Unlock mix color ${index + 1}`}>{item.locked ? '🔒' : '🔓'}</button>
                                    <div className="color-input-wrapper">
                                        <input type="color" value={item.color} onChange={(e) => handleMixColorChange(item.id, e.target.value)} className="color-picker-input" aria-label={`Mix color ${index + 1} picker`} disabled={item.locked} />
                                        <input type="text" value={item.color} onChange={(e) => handleMixColorChange(item.id, e.target.value)} className={`color-text-input ${!item.valid ? 'invalid' : ''}`} aria-invalid={!item.valid} aria-label={`Mix color ${index + 1} hex code`} disabled={item.locked} maxLength="7" />
                                    </div>
                                    <button onClick={() => randomizeMixColors(item.id)} className="button icon-only randomize-single-button" title="Randomize this color" aria-label={`Randomize mix color ${index + 1}`} disabled={item.locked}>🎲</button>
                                    {mixColors.length > 2 && (<button onClick={() => removeMixColor(item.id)} className="button icon-only remove-color-button" title="Remove Color" aria-label={`Remove mix color ${index + 1}`}>&times;</button>)}
                                    {!item.valid && <p className="error-message small">Invalid hex</p>}
                                </div>
                            ))}
                        </div>
                        {/* Buttons for adding/picking colors */}
                        <div className="mix-buttons">
                            <button onClick={() => addMixColor()} className="button add-color-button">+ Add Color</button>
                            {/* Hidden file input for image upload */}
                             <input
                                type="file"
                                accept="image/*" // Accept only image files
                                ref={imageInputRef}
                                onChange={handleImageUpload}
                                style={{ display: 'none' }}
                                aria-hidden="true"
                             />
                             {/* Button to trigger image upload */}
                             <button onClick={triggerImageInput} className="button" title="Upload image to pick color from">
                                 <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                                 Pick from Image
                             </button>
                            {/* Conditionally render EyeDropper button */}
                            {isEyeDropperSupported && (
                                <button onClick={pickColorFromScreen} className="button" title="Pick color from anywhere on screen">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 2.69 5.66 5.66a8 8 0 1 1-11.31 0L12 2.69z"/><path d="m12 13.54 5.66-5.66"/></svg>
                                    Pick from Screen
                                </button>
                            )}
                            <button onClick={() => randomizeMixColors(null)} className="button randomize-button" title="Randomize All Unlocked Mix Colors">Randomize Unlocked</button>
                        </div>
                    </div>
                    {/* Palette Generation Controls */}
                    <div className="control-group palette-controls">
                        <label id="generate-label" className="control-label">2. Generate Palette</label>
                        <div className="sub-control-group">
                            <label htmlFor="paletteTypeSelect" className="sub-label">Type</label>
                            <select id="paletteTypeSelect" value={paletteType} onChange={handleTypeChange} className="select-input" aria-labelledby="generate-label">
                                {PALETTE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                            </select>
                        </div>
                        <div className="sub-control-group">
                            <label htmlFor="colorCountSlider" className="slider-label sub-label">Count: <span>{colorCount}</span></label>
                            <input type="range" id="colorCountSlider" min="3" max="12" value={colorCount} onChange={handleCountChange} className="range-slider" aria-label={`Select number of colors for palette, current: ${colorCount}`} aria-labelledby="generate-label" />
                        </div>
                        <div className="sub-control-group">
                             <label htmlFor="displayFormatSelect" className="sub-label">Primary Display Format:</label>
                             <select id="displayFormatSelect" value={displayFormat} onChange={handleDisplayFormatChange} className="select-input small" aria-labelledby="generate-label">
                                 {DISPLAY_FORMATS.map(format => <option key={format.value} value={format.value}>{format.label}</option>)}
                             </select>
                        </div>
                        <div className="toggle-group">
                            <label htmlFor="showDetailsToggle" className="sub-label toggle-label">Show Secondary Details:</label>
                            <input type="checkbox" id="showDetailsToggle" className="info-toggle-checkbox" checked={showDetails} onChange={toggleDetailsDisplay} aria-labelledby="generate-label" />
                        </div>
                    </div>
                </section>

                {/* Results Area */}
                <section className="results-area" aria-live="polite">
                    {/* Mixed Color Result */}
                    {mixedColor && (
                        <div className="mixed-result-display">
                            <h2>Mix Result</h2>
                            <div className="mixed-color-display">
                                <div className={`color-swatch large ${!chroma.valid(mixedColor) ? 'invalid-swatch' : ''}`} style={{ backgroundColor: mixedColor || '#cccccc' }} aria-label={`Mixed color swatch ${mixedColor}`}></div>
                                <div className="swatch-info">
                                    {renderPrimaryValue(mixedColor, displayFormat)}
                                    {renderSecondaryDetails(mixedColor)}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Generated Palette */}
                    <div className="palette-display-area">
                        <div className="palette-header">
                            <h2>Generated Palette</h2>
                            <div className="palette-actions">
                                {mixedColor && chroma.valid(mixedColor) && palette.length > 0 && (<>
                                    <button onClick={exportPaletteJson} className="button export-button" title="Export Palette as JSON"><span className="button-text">Export JSON</span></button>
                                    <button onClick={saveCurrentPalette} className="button save-palette-button" title="Save Current Palette">💾 <span className="button-text">Save</span></button>
                                </>)}
                            </div>
                        </div>
                        {!mixedColor || !chroma.valid(mixedColor) ? ( <p className="empty-palette-message">Invalid base color. Fix mix colors.</p> )
                        : palette.length > 0 ? (
                            <div className="palette-grid">
                                {palette.map((color, index) => {
                                    const isValidSwatch = chroma.valid(color);
                                    return (
                                        <div key={`${color}-${index}`} className={`color-swatch-item ${!isValidSwatch ? 'invalid-swatch' : ''}`}>
                                            <div className="color-swatch" style={{ backgroundColor: isValidSwatch ? color : '#FF0000' }} aria-label={`Color swatch ${index + 1}: ${color}`}></div>
                                            <div className="swatch-info">
                                                {renderPrimaryValue(color, displayFormat)}
                                                {isValidSwatch && renderSecondaryDetails(color)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : ( <p className="empty-palette-message">{mixColors.some(item => item.valid) ? 'Generating...' : 'Enter valid colors.'}</p> )}
                    </div>

                    {/* Gradient Preview */}
                    {palette.length >= 2 && mixedColor && chroma.valid(mixedColor) && (
                        <div className="gradient-preview-area">
                            <div className="gradient-header">
                                <h2>Gradient Preview</h2>
                                <div className="sub-control-group">
                                    <label htmlFor="gradientDirectionSelect" className="sub-label">Direction:</label>
                                    <select id="gradientDirectionSelect" value={gradientDirection} onChange={handleGradientDirectionChange} className="select-input small">
                                        {GRADIENT_DIRECTIONS.map(dir => <option key={dir} value={dir}>{dir}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="gradient-preview-box" style={{ background: `linear-gradient(${gradientDirection}, ${palette.join(', ')})` }} title="Click to Copy CSS Gradient" onClick={() => handleCopyValue(`background: linear-gradient(${gradientDirection}, ${palette.join(', ')});`, 'CSS Gradient')} aria-label={`Preview of linear gradient. Click to copy CSS.`} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCopyValue(`background: linear-gradient(${gradientDirection}, ${palette.join(', ')});`, 'CSS Gradient'); }}>
                                <span className="copy-gradient-text">Click or Press Enter to Copy CSS</span>
                            </div>
                        </div>
                    )}
                </section>

                {/* Saved Palettes Section */}
                <section className={`saved-palettes-section ${savedPalettes.length === 0 ? 'empty' : ''}`} aria-labelledby="saved-heading">
                     <div className="saved-palettes-header">
                        <h2 id="saved-heading">Saved Palettes ({savedPalettes.length})</h2>
                        <div className="saved-palette-actions">
                            {/* Hidden input for JSON import */}
                            <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileImport} style={{ display: 'none' }} aria-hidden="true" />
                            <button onClick={triggerFileInput} className="button import-button" title="Import Palette from JSON File"><span className="button-text">Import JSON</span></button>
                        </div>
                    </div>
                    {savedPalettes.length > 0 ? (
                        <ul className="saved-palettes-list">
                            {savedPalettes.map((saved) => (
                                <li key={saved.id} className="saved-palette-item">
                                    <div className="saved-palette-info">
                                        {editingPaletteId === saved.id ? (
                                            <input type="text" value={editedPaletteName} onChange={handleEditNameChange} onBlur={saveEditedPaletteName} onKeyDown={handleEditNameKeyDown} className="edit-palette-name-input" autoFocus aria-label={`Edit palette name for ${saved.name}`} />
                                        ) : ( <span className="saved-palette-name" onClick={() => startEditingPaletteName(saved.id, saved.name)} title="Click to edit name" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') startEditingPaletteName(saved.id, saved.name); }}>{saved.name || `Palette ${saved.id}`}</span> )}
                                        <div className="saved-palette-preview" aria-label="Saved palette color preview">
                                            {Array.isArray(saved.palette) && saved.palette.slice(0, 7).map((c, i) => (<div key={`${c}-${i}`} style={{ backgroundColor: chroma.valid(c) ? c : '#cccccc' }} className="mini-swatch" title={c}></div>))}
                                            {Array.isArray(saved.palette) && saved.palette.length > 7 && <span className="mini-swatch-more">...</span>}
                                        </div>
                                    </div>
                                    <div className="saved-palette-actions item-actions">
                                        <button onClick={() => loadSavedPalette(saved)} className="button load-button" title="Load Palette" aria-label={`Load palette: ${saved.name}`}><span className="button-text">Load</span></button>
                                        <button onClick={() => deleteSavedPalette(saved.id)} className="button delete-button" title="Delete Palette" aria-label={`Delete palette: ${saved.name}`}><span className="button-text">Delete</span></button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                         <p className="empty-saved-message">No palettes saved yet. Generate and save one!</p>
                    )}
                </section>

                {/* Footer */}
                <footer className="app-footer">
                    <p>Palette Pro - Mix, Generate, Save, Import & Export Colors</p>
                </footer>
            </div>
        </div>
    );
}

export default App;
