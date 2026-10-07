const db = require("../../../config/database");


/*
|--------------------------------------------------------------------------
| Get All Cities
|--------------------------------------------------------------------------
*/

const getAllCities = async () => {

    const [rows] = await db.execute(`
        SELECT
            cico_id AS id,
            TRIM(cico_city_name) AS city_name,
            cico_state_name AS state_name,
            cico_type AS city_type,
            cico_latitude AS latitude,
            cico_longitude AS longitude
        FROM city_codes

        WHERE UPPER(cico_type) = 'CITY'

        ORDER BY cico_city_name ASC
    `);

    return rows;
};


/*
|--------------------------------------------------------------------------
| Search Cities
|--------------------------------------------------------------------------
|
| Example:
| q = "pun"
| Result = Pune
|
|--------------------------------------------------------------------------
*/

const searchCities = async (searchText) => {

    const search = searchText.trim();

    const [rows] = await db.execute(
        `
        SELECT
            cico_id AS id,
            TRIM(cico_city_name) AS city_name,
            cico_state_name AS state_name,
            cico_type AS city_type,
            cico_latitude AS latitude,
            cico_longitude AS longitude

        FROM city_codes

        WHERE UPPER(cico_type) = 'CITY'

        AND LOWER(TRIM(cico_city_name))
            LIKE LOWER(?)

        ORDER BY

            CASE
                WHEN LOWER(TRIM(cico_city_name)) = LOWER(?)
                    THEN 0

                WHEN LOWER(TRIM(cico_city_name))
                    LIKE LOWER(?)
                    THEN 1

                ELSE 2
            END,

            cico_city_name ASC

        LIMIT 30
        `,
        [
            `%${search}%`,
            search,
            `${search}%`
        ]
    );

    return rows;
};


/*
|--------------------------------------------------------------------------
| Get City By Code
|--------------------------------------------------------------------------
*/

const getCityById = async (cityId) => {

    const [rows] = await db.execute(
        `
        SELECT
            cico_id AS id,
            TRIM(cico_city_name) AS city_name,
            cico_state_name AS state_name,
            cico_type AS city_type,
            cico_latitude AS latitude,
            cico_longitude AS longitude

        FROM city_codes

        WHERE cico_id = ?

        AND UPPER(cico_type) = 'CITY'

        LIMIT 1
        `,
        [cityId]
    );

    if (rows.length === 0) {
        return null;
    }

    return rows[0];
};


module.exports = {
    getAllCities,
    searchCities,
    getCityById
};
