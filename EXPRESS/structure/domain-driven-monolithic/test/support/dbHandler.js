module.exports = (database) => {
    const resetDb = async () => {
        try {
            for (const key in database.models) {
                const element = database.models[key];
                await element.destroy({ truncate: { cascade: true } });
            }
        } catch (error) {
        }
    };
    return {
        resetDb
    }
}