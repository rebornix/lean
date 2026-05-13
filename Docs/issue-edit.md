# lean issue edit

`lean issue edit <ID>` updates fields on an existing issue. Each flag
corresponds to a field; absent flags are left unchanged.

## Rename an issue

```console
$ lean issue edit ENG-1 --title "Renamed"
ENG-1: Renamed
```

## Move to a different state

```console
$ lean issue edit ENG-1 --state Done
ENG-1: First issue
```

## Change priority

```console
$ lean issue edit ENG-1 --priority 1
ENG-1: First issue
```

## JSON output

```console
$ lean issue edit ENG-1 --title "New name" --json
{
  "id": "ENG-1",
  "title": "New name"
}
```
