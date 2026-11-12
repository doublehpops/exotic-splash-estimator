-- Cost-model defaults for Double to apply after he approves the draft.
-- This file is not applied by the change that adds it.
-- It does not change tier rates ($5/$8/$11, $6/$9/$13, $7/$10/$15) or payment schedules.

update public.price_book_owner p
set owner_settings =
  jsonb_set(
    jsonb_set(
      coalesce(p.owner_settings, '{}'::jsonb),
      '{costs}',
      coalesce(p.owner_settings->'costs', '{}'::jsonb) || jsonb_build_object(
        'labor', 42.5,
        'setupHours', 13,
        'waste', 10,
        'purchaseTax', 10.5,
        'overhead', 0,
        'billableHoursPerMonth', 448,
        'allowancesInOverhead', true,
        'markup', 42.86,
        'targetMargin', 30,
        'minMargin', 25,
        'grindProduction', 75,
        'baseProduction', 200,
        'flakeProduction', 250,
        'topProduction', 200,
        'metallicProduction', 100,
        'primerPass', false,
        'materialPerSqft', jsonb_build_object('solid', 1.26, 'flake', 2.25, 'metallic', 2.72),
        'overheadLines', jsonb_build_array(
          jsonb_build_object(
            'key', 'base',
            'label', 'Base overhead',
            'monthly', 15000,
            'status', 'OWNER-PROVIDED',
            'note', 'All-inclusive monthly overhead: licensing, insurance, equipment, and the rest of fixed cost.'
          )
        )
      ),
      true
    ),
    '{products,flake}',
    jsonb_build_object(
      'label', 'Decorative flakes (40 lb box)',
      'size', 40,
      'price', 108,
      'coverage', 0,
      'unit', 'lb'
    ),
    true
  )
where p.id = 1;

update public.price_book p
set staff_settings =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(p.staff_settings, '{}'::jsonb),
          '{rates,minimumJob}',
          '2000'::jsonb,
          true
        ),
        '{addOn}',
        coalesce(p.staff_settings->'addOn', '{}'::jsonb) || jsonb_build_object('low', 0, 'high', 0, 'enabled', false),
        true
      ),
      '{catalog,garage}',
      coalesce(p.staff_settings#>'{catalog,garage}', '{}'::jsonb) || jsonb_build_object(
        'oneCarStarting', 2500,
        'twoCarStarting', 4500,
        'threeCarStarting', 6500,
        'packageSqft', jsonb_build_object('oneCar', 250, 'twoCar', 450, 'threeCar', 650),
        'materialAdj', coalesce(p.staff_settings#>'{catalog,garage,materialAdj}', '{}'::jsonb) || jsonb_build_object(
          'solid', jsonb_build_object('oneCar', -750, 'twoCar', -1350, 'threeCar', -1950),
          'flake', 0
        )
      ),
      true
    ),
    '{catalog,flatwork,maxItemSqft}',
    '32'::jsonb,
    true
  )
where p.id = 1;
