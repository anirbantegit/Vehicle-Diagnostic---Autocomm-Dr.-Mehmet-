type EmptyStateProps = {text: string; inverted?: boolean};

export const EmptyState = ({text, inverted = false}: EmptyStateProps) => (
    <div className={`mobile-empty-state flex min-h-20 items-center justify-center rounded-2xl border border-dashed px-4 text-center text-sm ${inverted ? 'mobile-empty-state--inverted' : ''}`}>
        {text}
    </div>
);
