const db = require("../../../config/database");

const CITY_SELECT = `
  CAST(CityId AS CHAR) AS id,
  CAST(CityId AS CHAR) AS city_code,
  TRIM(CityName) AS city_name,
  DistrictName AS district_name,
  StateName AS state_name,
  StateCode AS state_code,
  CountryName AS country_name,
  CountryCode AS country_code,
  Type AS city_type,
  CAST(ParentCityId AS CHAR) AS parent_city_id,
  Timezone AS timezone
`;

/*
 * CityId is the SRDV city code. Return it as a string so bigint values are not
 * rounded by JavaScript and can be passed directly to the provider APIs.
 * `id` is kept as a compatibility alias for existing mobile clients.
 */
const getAllCities = async () => {
  const [rows] = await db.execute(`
    SELECT ${CITY_SELECT}
      FROM bus_cities
     WHERE UPPER(Type) = 'CITY'
     ORDER BY CityName ASC
  `);

  return rows;
};

const searchCities = async (searchText) => {
  const search = String(searchText || "").trim();

  const [rows] = await db.execute(
    `
    SELECT ${CITY_SELECT}
      FROM bus_cities
     WHERE UPPER(Type) = 'CITY'
       AND (
         LOWER(TRIM(CityName)) LIKE LOWER(?)
         OR LOWER(COALESCE(DistrictName, '')) LIKE LOWER(?)
         OR LOWER(StateName) LIKE LOWER(?)
       )
     ORDER BY
       CASE
         WHEN LOWER(TRIM(CityName)) = LOWER(?) THEN 0
         WHEN LOWER(TRIM(CityName)) LIKE LOWER(?) THEN 1
         ELSE 2
       END,
       CityName ASC
     LIMIT 30
    `,
    [
      `%${search}%`,
      `%${search}%`,
      `%${search}%`,
      search,
      `${search}%`,
    ],
  );

  return rows;
};

const getCityById = async (cityId) => {
  const [rows] = await db.execute(
    `
    SELECT ${CITY_SELECT}
      FROM bus_cities
     WHERE CityId = ?
       AND UPPER(Type) = 'CITY'
     LIMIT 1
    `,
    [String(cityId).trim()],
  );

  return rows[0] || null;
};

module.exports = {
  getAllCities,
  searchCities,
  getCityById,
};
