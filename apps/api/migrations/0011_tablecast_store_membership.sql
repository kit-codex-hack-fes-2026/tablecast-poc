-- 店舗ごとの認可境界へ分割し、注文・卓・端末のIDを維持する。
CREATE TABLE tablecast_store_org_migration AS
SELECT id AS store_id, organization_id AS old_id, team_id,
 CASE WHEN row_number() OVER (PARTITION BY organization_id ORDER BY id)=1 THEN organization_id
 ELSE 'tablecast-org-' || id END AS new_id
FROM stores;
INSERT INTO organization(id,name,slug,created_at)
SELECT map.new_id,s.name,'tablecast-store-' || s.id,o.created_at
FROM tablecast_store_org_migration map JOIN stores s ON s.id=map.store_id JOIN organization o ON o.id=map.old_id
WHERE map.new_id<>map.old_id;
INSERT INTO member(id,organization_id,user_id,role,created_at)
SELECT 'tablecast-store-member-' || map.store_id || '-' || m.id,map.new_id,m.user_id,m.role,m.created_at
FROM tablecast_store_org_migration map JOIN member m ON m.organization_id=map.old_id
WHERE map.new_id<>map.old_id AND (m.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM team_member tm WHERE tm.team_id=map.team_id AND tm.user_id=m.user_id));
DELETE FROM member WHERE organization_id IN (SELECT new_id FROM tablecast_store_org_migration WHERE new_id=old_id)
 AND role NOT IN ('owner','admin') AND NOT EXISTS(SELECT 1 FROM tablecast_store_org_migration map JOIN team_member tm ON tm.team_id=map.team_id WHERE map.new_id=map.old_id AND map.old_id=member.organization_id AND tm.user_id=member.user_id);
-- 分割前の複数店舗へのOAuth承認を、新しい店舗へ暗黙に引き継がない。
UPDATE oauth_access_token SET revoked=unixepoch()*1000 WHERE reference_id IN (SELECT old_id FROM tablecast_store_org_migration GROUP BY old_id HAVING COUNT(*)>1);
UPDATE oauth_refresh_token SET revoked=unixepoch()*1000 WHERE reference_id IN (SELECT old_id FROM tablecast_store_org_migration GROUP BY old_id HAVING COUNT(*)>1);
DELETE FROM oauth_consent WHERE reference_id IN (SELECT old_id FROM tablecast_store_org_migration GROUP BY old_id HAVING COUNT(*)>1);
UPDATE stores SET organization_id=(SELECT new_id FROM tablecast_store_org_migration WHERE store_id=stores.id),team_id=NULL;
UPDATE organization SET name=(SELECT name FROM stores WHERE organization_id=organization.id) WHERE id IN (SELECT organization_id FROM stores);
UPDATE session SET active_team_id=NULL, active_organization_id=(SELECT m.organization_id FROM member m JOIN stores s ON s.organization_id=m.organization_id WHERE m.user_id=session.user_id ORDER BY s.id LIMIT 1)
WHERE active_organization_id IN (SELECT old_id FROM tablecast_store_org_migration) AND NOT EXISTS(SELECT 1 FROM member m WHERE m.organization_id=session.active_organization_id AND m.user_id=session.user_id);
CREATE UNIQUE INDEX stores_organization_id_unique ON stores(organization_id);
DROP TABLE tablecast_store_org_migration;
