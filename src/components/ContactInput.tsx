import { useState, useRef, useCallback, useEffect } from 'react';
import { useContactsStore } from '@/stores/contacts';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Contact } from '@/types';

interface ContactInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function ContactInput({ value, onChange, placeholder, className }: ContactInputProps) {
  const getSuggestions = useContactsStore((s) => s.getSuggestions);
  const [suggestions, setSuggestions] = useState<Contact[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const skipBlurRef = useRef(false);

  // Extract the last segment (after the last comma) as the query
  const getLastSegment = useCallback((val: string) => {
    const parts = val.split(',');
    return parts[parts.length - 1].trim();
  }, []);

  const updateSuggestions = useCallback(
    (val: string) => {
      const query = getLastSegment(val);
      if (query.length < 1) {
        setSuggestions([]);
        setShowDropdown(false);
        return;
      }
      const results = getSuggestions(query, 8);
      setSuggestions(results);
      setHighlightIndex(results.length > 0 ? 0 : -1);
      setShowDropdown(results.length > 0);
    },
    [getSuggestions, getLastSegment]
  );

  const selectSuggestion = useCallback(
    (contact: Contact) => {
      const parts = value.split(',');
      // 이전 주소들 (마지막 세그먼트 제외)
      const prev = parts.slice(0, -1).map((p) => p.trim()).filter(Boolean);
      prev.push(contact.email);
      const newValue = prev.join(', ');
      onChange(newValue);
      setSuggestions([]);
      setShowDropdown(false);
      setHighlightIndex(-1);
      // Focus back to input
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [value, onChange]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = e.target.value;
      onChange(newVal);
      updateSuggestions(newVal);
    },
    [onChange, updateSuggestions]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showDropdown || suggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
          e.preventDefault();
          selectSuggestion(suggestions[highlightIndex]);
        }
        return;
      }
      if (e.key === 'Escape') {
        setShowDropdown(false);
        setSuggestions([]);
      }
    },
    [showDropdown, suggestions, highlightIndex, selectSuggestion]
  );

  const handleBlur = useCallback(() => {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    // Delay to allow click on suggestion
    setTimeout(() => {
      setShowDropdown(false);
    }, 150);
  }, []);

  const handleFocus = useCallback(() => {
    updateSuggestions(value);
  }, [value, updateSuggestions]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative flex-1">
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={placeholder}
        className={className}
      />
      {showDropdown && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-md border shadow-lg"
          style={{ background: 'hsl(var(--background))' }}
        >
          {suggestions.map((contact, index) => (
            <button
              key={contact.email}
              type="button"
              className={cn(
                'w-full text-left px-3 py-1.5 text-sm hover:bg-accent cursor-pointer',
                index === highlightIndex && 'bg-accent'
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                skipBlurRef.current = true;
              }}
              onClick={() => selectSuggestion(contact)}
              onMouseEnter={() => setHighlightIndex(index)}
            >
              <div className="flex items-center gap-2">
                {contact.name ? (
                  <>
                    <span className="font-medium truncate">{contact.name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {contact.email}
                    </span>
                  </>
                ) : (
                  <span className="truncate">{contact.email}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
