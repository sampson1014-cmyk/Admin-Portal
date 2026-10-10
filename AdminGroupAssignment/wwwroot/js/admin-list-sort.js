// Return a sorted copy, leaving the API records and active filters untouched.
window.AdminListSort = (records, order, getName, getId) => {
    const compare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;
    const byId = (a, b) => compare(String(getId(a) ?? ''), String(getId(b) ?? ''));
    return [...records].sort((a, b) => {
        if (order === 'name-asc' || order === 'name-desc') {
            const result = compare(String(getName(a) ?? ''), String(getName(b) ?? ''));
            return (order === 'name-desc' ? -result : result) || byId(a, b);
        }
        return order === 'id-desc' ? -byId(a, b) : byId(a, b);
    });
};
