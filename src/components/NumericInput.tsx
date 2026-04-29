import React, { useState, useEffect } from 'react';

interface NumericInputProps {
    value: number;
    onChange: (val: number) => void;
    className?: string;
    placeholder?: string;
    step?: string | number;
    min?: number;
    max?: number;
    id?: string;
    allowNegative?: boolean;
}

/**
 * A robust numeric input that solves the "auto-populated zero" and "negative sign" issues.
 * 
 * Traditional <input type="number"> with Number(e.target.value) binding immediately 
 * converts empty strings to 0 and makes it impossible to type a leading "-" or ".".
 * 
 * This component maintains a local string state to allow the user to type freely
 * (including empty states, leading signs, and decimal points) and only pushes
 * valid numeric updates back to the parent store.
 */
export const NumericInput: React.FC<NumericInputProps> = ({ 
    value, 
    onChange, 
    className, 
    placeholder,
    min,
    max,
    id,
    allowNegative
}) => {
    // Keep local string state so user can type '-', '.', or '' without it being
    // snapped to 0 or NaN by the Number() constructor.
    const [tempValue, setTempValue] = useState<string>(value.toString());

    // Sync from parent if value changes elsewhere (e.g. store hydration or external reset)
    useEffect(() => {
        const numVal = parseFloat(tempValue);
        if (numVal !== value) {
            setTempValue(value.toString());
        }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const str = e.target.value;
        setTempValue(str);

        // Don't update the parent if the string is currently transient/incomplete
        if (str === '' || str === '-' || str === '.') return;
        
        const num = parseFloat(str);
        if (!isNaN(num)) {
            // Pass the raw value to the parent while typing — do NOT clamp here.
            // Clamping on every keystroke causes mid-type values (e.g. typing "2"
            // towards "20") to be snapped to min, which then triggers the useEffect
            // sync and overwrites tempValue, corrupting the user's input.
            if (num !== value) {
                onChange(num);
            }
        }
    };

    const handleBlur = () => {
        // On blur: clamp to min/max and canonicalize the displayed string
        if (tempValue === '' || tempValue === '-' || tempValue === '.') {
            setTempValue(value.toString());
            return;
        }

        const num = parseFloat(tempValue);
        if (!isNaN(num)) {
            let final = num;
            if (min !== undefined && final < min) final = min;
            if (max !== undefined && final > max) final = max;
            // Fire onChange with clamped value if it changed
            if (final !== value) onChange(final);
            setTempValue(final.toString());
        } else {
            setTempValue(value.toString());
        }
    };

    // On mobile (especially iOS), inputMode="decimal" does NOT include the minus sign.
    // If negative values are allowed, we MUST use "text" or "tel" (not recommended for general decimals).
    // We default to allowing negative if min is not set or is less than zero.
    const canBeNegative = allowNegative ?? (min === undefined || min < 0);
    const inputMode = canBeNegative ? 'text' : 'decimal';

    return (
        <input
            id={id}
            type="text"
            inputMode={inputMode} 
            value={tempValue}
            onChange={handleChange}
            onBlur={handleBlur}
            className={className}
            placeholder={placeholder}
        />
    );
};
