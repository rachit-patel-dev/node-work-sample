/**
 * Calculates pagination metadata based on the given parameters.
 *
 * @param {Object} req - The request object.
 * @param {number} totalCount - The total count of items.
 * @param {number} limit - The maximum number of items per page.
 * @param {number} count - The actual number of items on the current page.
 * @param {number} pageNumber - The current page number.
 * @param {boolean} [isSearchable=false] - Indicates if the pagination is for a searchable result.
 * @returns {Object} - The pagination metadata object.
 */
const paginator = async (req, totalCount, limit, count, pageNumber, isSearchable = false) => {
    const startIndex = pageNumber * limit;
    const endIndex = Math.min(startIndex + limit, totalCount);
    const paginateMeta = {
        Pages: Math.ceil(totalCount / limit),
        PageSize: count,
        PageNumber: pageNumber,
        TotalCount: totalCount,
        Next: null,
        Previous: null,
    };
    if (endIndex < totalCount) {
        const nextUrl = `${req.protocol}://${req.get("host")}${req.baseUrl}?PageSize=${limit}&PageNumber=${pageNumber + 1}`;
        paginateMeta.Next = nextUrl;
    }
    if (startIndex > 0) {
        const previousUrl = `${req.protocol}://${req.get("host")}${req.baseUrl}?PageSize=${limit}&PageNumber=${pageNumber - 1}`;
        paginateMeta.Previous = previousUrl;
    }
    if (isSearchable && (count < totalCount) && (count < limit)) {
        paginateMeta.Next = null;
    }
    if (paginateMeta.PageNumber === 0 && paginateMeta.PageSize === 0) {
        paginateMeta.Pages = 0
    }
    return paginateMeta;
}

module.exports = {
    paginator
}