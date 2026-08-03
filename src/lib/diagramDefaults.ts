export const DEFAULT_LIVE_UML_SOURCE = `@startuml
title Live PlantUML

actor User
participant "YONOTE PWA" as App
participant "Local PlantUML" as UML

User -> App: Edit diagram source
App -> UML: Render in browser
UML --> App: SVG
App --> User: Live preview

note over App,UML
  No API request
  No D1 write
  Source stays in memory
end note
@enduml`;

export const DEFAULT_LIVE_MERMAID_SOURCE = `flowchart LR
  User[User] --> Editor[Live Mermaid editor]
  Editor --> Renderer[Local Mermaid renderer]
  Renderer --> Preview[Live SVG preview]
  Editor -. no API request .-> Memory[(Browser RAM)]`;
