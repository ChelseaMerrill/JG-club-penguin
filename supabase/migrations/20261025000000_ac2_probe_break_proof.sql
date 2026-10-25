-- THROWAWAY (#249 AC 2): deliberately breaks 218_pao_de_queijo_proof.sql so the
-- PR gate must fail. Reverted in the next commit; never merged.
update public.badges set available = false where id = 'mestre-do-pao-de-queijo';
